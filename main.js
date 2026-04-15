const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path    = require('path')
const os      = require('os')
const fs      = require('fs')
const https   = require('https')
const { execFile, execFileSync, spawn } = require('child_process')

// ── FFmpeg detection ──────────────────────────────────────────────────────────
let ffmpegPath = null
try {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  const out  = execFileSync(cmd, ['ffmpeg'], { encoding: 'utf8' }).trim()
  ffmpegPath = out.split('\n')[0].trim() || null
} catch (_) {}
if (!ffmpegPath) {
  try { ffmpegPath = require('ffmpeg-static') } catch (_) {}
}

function ffprobeFor(p) {
  if (!p) return 'ffprobe'
  if (/ffmpeg(\.exe)?$/i.test(p)) return p.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1')
  return 'ffprobe'
}

// ── yt-dlp detection ──────────────────────────────────────────────────────────
let ytDlpPath = null
const ytDlpCandidates = [
  'yt-dlp',
  path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe'),
  path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
]
for (const candidate of ytDlpCandidates) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which',
      [candidate.includes(path.sep) ? candidate : candidate],
      { encoding: 'utf8', timeout: 3000, stdio: 'pipe' })
    ytDlpPath = candidate; break
  } catch (_) {
    // try running it directly
    try { execFileSync(candidate, ['--version'], { encoding: 'utf8', timeout: 3000, stdio: 'pipe' }); ytDlpPath = candidate; break } catch (__) {}
  }
}

// ── App state ─────────────────────────────────────────────────────────────────
let mainWindow    = null
let activeProject = null

const RECENT_FILE   = path.join(os.homedir(), '.va-recent.json')
const SETTINGS_FILE = path.join(os.homedir(), '.va-settings.json')
const exportTmpBase = path.join(os.tmpdir(), `va-export-${Date.now()}`)

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  Menu.setApplicationMenu(null)
  mainWindow = new BrowserWindow({
    width: 1600, height: 960,
    minWidth: 1000, minHeight: 640,
    backgroundColor: '#1a1a1a',
    title: 'Video Analyzer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  try { fs.rmSync(exportTmpBase, { recursive: true, force: true }) } catch (_) {}
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── Recent projects ───────────────────────────────────────────────────────────
function readRecent() {
  try { return JSON.parse(fs.readFileSync(RECENT_FILE, 'utf8')) } catch (_) { return [] }
}
function addRecent(projectPath) {
  let list = readRecent().filter(p => p !== projectPath)
  list.unshift(projectPath)
  list = list.slice(0, 10)
  try { fs.writeFileSync(RECENT_FILE, JSON.stringify(list), 'utf8') } catch (_) {}
}

ipcMain.handle('get-recent-projects', () => {
  return readRecent().filter(p => { try { return fs.existsSync(p) } catch (_) { return false } })
})

// ── Project management ────────────────────────────────────────────────────────
ipcMain.handle('pick-project-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Project Folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('pick-project-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: 'Video Analyzer Project', extensions: ['vap'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('create-project', (_, { folderPath, name }) => {
  const projectFile = path.join(folderPath, `${sanitizeName(name)}.vap`)
  const workingDir  = path.join(folderPath, 'working')
  fs.mkdirSync(workingDir, { recursive: true })
  const data = {
    version: 1, name,
    created:  new Date().toISOString(),
    modified: new Date().toISOString(),
    media: [],
    tracks: [{ id: 'track-0', name: 'Video 1', clips: [] }],
    zoom: 80, playhead: 0,
  }
  fs.writeFileSync(projectFile, JSON.stringify(data, null, 2), 'utf8')
  activeProject = { path: projectFile, dir: folderPath }
  addRecent(projectFile)
  return { projectFile, data }
})

ipcMain.handle('open-project', (_, projectFile) => {
  const data = JSON.parse(fs.readFileSync(projectFile, 'utf8'))
  activeProject = { path: projectFile, dir: path.dirname(projectFile) }
  addRecent(projectFile)
  return { projectFile, data }
})

ipcMain.handle('save-project', (_, { projectFile, data }) => {
  data.modified = new Date().toISOString()
  fs.writeFileSync(projectFile, JSON.stringify(data, null, 2), 'utf8')
  return true
})

ipcMain.handle('get-active-project', () => activeProject)

// ── Import media → MKV working copy ──────────────────────────────────────────
ipcMain.handle('open-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'flv'] }],
  })
  return canceled ? [] : filePaths
})

ipcMain.handle('import-to-mkv', async (_, { sourcePath, mediaId }) => {
  const projectDir = activeProject?.dir || os.tmpdir()
  const workingDir = path.join(projectDir, 'working')
  fs.mkdirSync(workingDir, { recursive: true })
  const mkvPath = path.join(workingDir, `${mediaId}.mkv`)

  if (!ffmpegPath) {
    return { success: true, mkvPath: sourcePath, url: pathToUrl(sourcePath), native: true }
  }
  return new Promise(resolve => {
    execFile(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-nostats',
      '-fflags', '+discardcorrupt', '-err_detect', 'ignore_err',
      '-i', sourcePath,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
      '-y', mkvPath,
    ], { maxBuffer: 10 * 1024 * 1024 }, err => {
      if (err) resolve({ success: true, mkvPath: sourcePath, url: pathToUrl(sourcePath), native: true })
      else     resolve({ success: true, mkvPath, url: pathToUrl(mkvPath), native: false })
    })
  })
})

// ── Export ────────────────────────────────────────────────────────────────────
ipcMain.handle('save-file', async (_, defaultName) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'output.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  })
  return canceled ? null : filePath
})

ipcMain.handle('export-video', async (_, { clips, outputPath }) => {
  if (!ffmpegPath) return { success: false, error: 'FFmpeg not found' }
  if (!clips?.length) return { success: false, error: 'No clips' }

  const exportDir = path.join(exportTmpBase, `run-${Date.now()}`)
  fs.mkdirSync(exportDir, { recursive: true })
  const segments = []

  try {
    // Probe first clip for target resolution
    let targetW = 1280, targetH = 720
    try {
      const out = execFileSync(
        ffprobeFor(ffmpegPath),
        ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
         '-of', 'csv=p=0:s=x', clips[0].mkvPath],
        { encoding: 'utf8', timeout: 8000 }
      ).trim()
      const parts = out.split('x').map(n => parseInt(n, 10))
      if (parts[0] > 0 && parts[1] > 0) { targetW = parts[0]; targetH = parts[1] }
    } catch (_) {}

    for (let i = 0; i < clips.length; i++) {
      const { mkvPath, sourceStart, sourceDuration, speed } = clips[i]
      const out = path.join(exportDir, `seg_${i}.mp4`)
      segments.push(out)
      send('export-progress', { step: i + 1, total: clips.length + 1, msg: `Encoding clip ${i + 1}/${clips.length}…` })
      const args = [
        '-hide_banner', '-loglevel', 'error', '-nostats',
        '-fflags', '+discardcorrupt', '-err_detect', 'ignore_err',
        '-i', mkvPath, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-ss', String(sourceStart), '-t', String(Math.max(0.05, sourceDuration)),
        '-map', '0:v:0', '-map', '0:a:0?', '-map', '1:a:0',
      ]
      if (speed !== 1) {
        args.push('-vf', `setpts=${(1 / speed).toFixed(8)}*PTS`)
        args.push('-af', buildAtempo(speed))
      }
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-y', out)
      await runFFmpeg(ffmpegPath, args)
    }

    send('export-progress', { step: clips.length + 1, total: clips.length + 1, msg: 'Concatenating…' })
    const concatArgs = ['-hide_banner', '-loglevel', 'error', '-nostats']
    segments.forEach(s => concatArgs.push('-i', s))
    const vNorm = segments.map((_, idx) =>
      `[${idx}:v:0]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS[v${idx}]`
    ).join(';')
    const aNorm = segments.map((_, idx) =>
      `[${idx}:a:0]aformat=sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0[a${idx}]`
    ).join(';')
    const inputs = segments.map((_, idx) => `[v${idx}][a${idx}]`).join('')
    const filter = `${vNorm};${aNorm};${inputs}concat=n=${segments.length}:v=1:a=1[v][a]`
    concatArgs.push(
      '-filter_complex', filter,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
      '-movflags', '+faststart', '-y', outputPath
    )
    await runFFmpeg(ffmpegPath, concatArgs)
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  } finally {
    try { fs.rmSync(exportDir, { recursive: true, force: true }) } catch (_) {}
  }
})

// ── YouTube import ────────────────────────────────────────────────────────────
ipcMain.handle('get-yt-dlp-status', () => ({ available: !!ytDlpPath, path: ytDlpPath }))

ipcMain.handle('import-youtube', async (_, { url, quality }) => {
  if (!ytDlpPath) {
    return {
      success: false,
      error: 'yt-dlp is not installed.\n\nInstall it with one of:\n  pip install yt-dlp\n  winget install yt-dlp\n  brew install yt-dlp\n\nThen restart the app.',
    }
  }

  const projectDir = activeProject?.dir || os.tmpdir()
  const workingDir = path.join(projectDir, 'working')
  fs.mkdirSync(workingDir, { recursive: true })

  // ── Step 1: fetch metadata (title, duration) ──────────────────────────────
  send('youtube-progress', { pct: 0, step: 'Fetching video info…' })
  let videoTitle = 'YouTube Video'
  let videoId    = 'yt_' + Date.now()
  try {
    const meta = execFileSync(
      ytDlpPath,
      ['--print', '%(id)s|||%(title)s', '--no-download', '--no-playlist', url],
      { encoding: 'utf8', timeout: 30000 }
    ).trim().split('\n')[0]
    const parts = meta.split('|||')
    if (parts[0]) videoId    = parts[0].trim()
    if (parts[1]) videoTitle = parts[1].trim()
  } catch (e) {
    send('youtube-progress', { pct: 2, step: `Metadata fetch warning: ${e.message.slice(0, 80)}` })
  }

  // ── Step 2: download ──────────────────────────────────────────────────────
  const fmtMap = {
    '720':  'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best',
    '1080': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
    'best': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
  }
  const fmt        = fmtMap[quality] || fmtMap['720']
  const outputTmpl = path.join(workingDir, `${videoId}.%(ext)s`)

  const args = [
    '--format', fmt,
    '--merge-output-format', 'mp4',
    '--output', outputTmpl,
    '--newline',
    '--no-playlist',
    '--no-part',
    url,
  ]

  return new Promise((resolve) => {
    let downloadedPath = null
    const proc = spawn(ytDlpPath, args, { windowsHide: true })

    proc.stdout.on('data', (chunk) => {
      for (const raw of chunk.toString().split('\n')) {
        const line = raw.trim()
        if (!line) continue

        // Detect output file path
        if (/Destination:|Merging formats into/i.test(line)) {
          const m = line.match(/(?:Destination:|Merging formats into) "?(.+?)"?\s*$/)
          if (m) downloadedPath = m[1].trim().replace(/^"/, '').replace(/"$/, '')
        }
        if (/\[download\].*already been downloaded/i.test(line)) {
          const m = line.match(/\[download\] (.+?) has already/)
          if (m) downloadedPath = m[1].trim()
        }

        // Parse percentage for progress bar
        let pct = null
        const pctMatch = line.match(/(\d+\.?\d*)%/)
        if (pctMatch) pct = Math.min(95, parseFloat(pctMatch[1]))

        send('youtube-progress', { pct, step: line })
      }
    })

    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString().trim()
      if (msg) send('youtube-progress', { step: msg })
    })

    proc.on('error', (err) => resolve({ success: false, error: err.message }))

    proc.on('close', (code) => {
      if (code !== 0 && !downloadedPath) {
        resolve({ success: false, error: `yt-dlp exited with code ${code}. Check the URL and try again.` })
        return
      }

      // Fallback: find the newest mp4 in workingDir if path wasn't parsed
      if (!downloadedPath) {
        try {
          const files = fs.readdirSync(workingDir)
            .filter(f => f.endsWith('.mp4') && f.startsWith(videoId))
            .map(f => ({ p: path.join(workingDir, f), t: fs.statSync(path.join(workingDir, f)).mtimeMs }))
            .sort((a, b) => b.t - a.t)
          if (files.length) downloadedPath = files[0].p
        } catch (_) {}
      }

      if (!downloadedPath || !fs.existsSync(downloadedPath)) {
        resolve({ success: false, error: 'Download finished but output file not found.' })
        return
      }

      send('youtube-progress', { pct: 100, step: 'Download complete!' })
      resolve({ success: true, filePath: downloadedPath, title: videoTitle })
    })
  })
})

// ── Video analysis ────────────────────────────────────────────────────────────
ipcMain.handle('analyze-video', async (_, { videoPath, who, doing, about, openaiKey, model }) => {
  if (!ffmpegPath) return { success: false, error: 'FFmpeg not found. Install FFmpeg or check your installation.' }
  if (!openaiKey)  return { success: false, error: 'OpenAI API key required. Add it in Settings (⚙).' }

  const tmpDir      = path.join(os.tmpdir(), `va-${Date.now()}`)
  const chosenModel = model || 'gpt-4o'
  fs.mkdirSync(tmpDir, { recursive: true })

  try {
    // ── 1. Probe duration ─────────────────────────────────────────────────────
    send('analyze-video-progress', { step: 1, total: 4, msg: 'Probing video…' })
    const duration = await probeVideoDuration(videoPath)

    // ── 2. Transcribe full audio (one Whisper call, reused for every segment) ──
    send('analyze-video-progress', { step: 2, total: 4, msg: 'Transcribing audio with Whisper…' })
    let transcriptSegments = []   // [{start, end, text}]
    let fullTranscriptText = ''
    try {
      const audioPath = path.join(tmpDir, 'audio.mp3')
      await extractAudioFFmpeg(videoPath, audioPath)
      if (fs.statSync(audioPath).size > 2000) {
        const tr = await whisperTranscribe(audioPath, openaiKey)
        transcriptSegments = tr.segments
        fullTranscriptText = tr.text
        send('analyze-video-progress', { step: 2, total: 4, msg: `Transcript ready — ${transcriptSegments.length} segments` })
      }
    } catch (te) {
      send('analyze-video-progress', { step: 2, total: 4, msg: `Transcript skipped: ${te.message.slice(0, 80)}` })
    }

    // ── 3. Plan segments & run per-segment vision passes ──────────────────────
    const { segmentDuration, framesPerSegment } = planSegments(duration)
    const numSegments = Math.ceil(duration / segmentDuration)
    const totalSteps  = 2 + numSegments + 1  // probe + transcribe + N segments + synthesis

    send('analyze-video-progress', {
      step: 2, total: totalSteps,
      msg: `Splitting into ${numSegments} segment${numSegments > 1 ? 's' : ''} · ${framesPerSegment} frames each`,
    })

    const allObservations = []

    for (let i = 0; i < numSegments; i++) {
      const segStart = i * segmentDuration
      const segEnd   = Math.min(segStart + segmentDuration, duration)
      const stepNum  = 3 + i

      send('analyze-video-progress', {
        step: stepNum, total: totalSteps,
        msg: `Analyzing segment ${i + 1}/${numSegments}  (${fmtTimeSec(segStart)} – ${fmtTimeSec(segEnd)})…`,
      })

      // Extract frames for this segment only
      const segFramesDir = path.join(tmpDir, `seg_${i}`)
      fs.mkdirSync(segFramesDir, { recursive: true })
      const frames = await extractFramesForSegment(
        videoPath, segFramesDir, segStart, segEnd - segStart, framesPerSegment
      )

      // Slice transcript to this window
      const segTranscript = transcriptSegments
        .filter(s => s.end > segStart && s.start < segEnd)
        .map(s => {
          const m = Math.floor(s.start / 60); const sec = (s.start % 60).toFixed(1)
          return `[${m}:${sec}] ${s.text.trim()}`
        }).join('\n')

      try {
        const obs = await analyzeSegment(
          frames, segTranscript, segStart, segEnd, who, doing, about, openaiKey, chosenModel
        )
        allObservations.push(...obs)
        send('analyze-video-progress', {
          step: stepNum, total: totalSteps,
          msg: `Segment ${i + 1}/${numSegments} done — ${obs.length} observations`,
        })
      } catch (se) {
        // Non-fatal: a failed segment still leaves others intact
        send('analyze-video-progress', {
          step: stepNum, total: totalSteps,
          msg: `Segment ${i + 1} warning: ${se.message.slice(0, 80)}`,
        })
      }
    }

    // ── 4. Synthesis pass (text only, no images) ───────────────────────────────
    send('analyze-video-progress', {
      step: totalSteps, total: totalSteps,
      msg: `Synthesizing ${allObservations.length} observations into summary & scores…`,
    })
    const synthesis = await synthesizeResults(
      allObservations, fullTranscriptText, duration, who, doing, about, openaiKey, chosenModel
    )

    return {
      success: true,
      timestamps: allObservations.sort((a, b) => a.time - b.time),
      summary:    synthesis.summary,
      scores:     synthesis.scores,
    }

  } catch (err) {
    return { success: false, error: err.message }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (_) {}
  }
})

// ── Analysis helpers ──────────────────────────────────────────────────────────

/**
 * Decide segment size and frame density based on video length.
 * Goal: ~1 frame every 12–15 s inside each segment, capped at 15 total segments.
 */
function planSegments(duration) {
  let segmentDuration, framesPerSegment
  if      (duration <=  180) { segmentDuration = duration; framesPerSegment = 15 }  // < 3 min  → 1 seg
  else if (duration <=  600) { segmentDuration = 120;      framesPerSegment = 12 }  // 3–10 min → 2-min segs
  else if (duration <= 1800) { segmentDuration = 180;      framesPerSegment = 12 }  // 10–30 min → 3-min segs
  else if (duration <= 3600) { segmentDuration = 240;      framesPerSegment = 10 }  // 30–60 min → 4-min segs
  else                       { segmentDuration = 360;      framesPerSegment =  8 }  // > 60 min  → 6-min segs

  // Hard cap: never more than 15 segments
  const numSegs = Math.ceil(duration / segmentDuration)
  if (numSegs > 15) {
    segmentDuration = Math.ceil(duration / 15)
    framesPerSegment = Math.max(6, framesPerSegment - 2)
  }
  return { segmentDuration, framesPerSegment }
}

function fmtTimeSec(s) {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

function probeVideoDuration(videoPath) {
  return new Promise((resolve) => {
    execFile(
      ffprobeFor(ffmpegPath),
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
      { encoding: 'utf8', timeout: 10000 },
      (err, stdout) => { const d = parseFloat((stdout || '').trim()); resolve(isNaN(d) ? 300 : d) }
    )
  })
}

function extractAudioFFmpeg(videoPath, audioPath) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-i', videoPath,
      '-vn', '-acodec', 'mp3', '-ar', '16000', '-ac', '1',
      '-y', audioPath,
    ], { maxBuffer: 200 * 1024 * 1024 }, (err) => { if (err) reject(err); else resolve() })
  })
}

/**
 * Extract exactly `count` evenly-spaced frames from a time window [segStart, segStart+segDur].
 * Returns [{timestamp (abs seconds), b64}].
 */
function extractFramesForSegment(videoPath, framesDir, segStart, segDur, count) {
  return new Promise((resolve) => {
    const interval = Math.max(0.5, segDur / count)
    execFile(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-ss', segStart.toFixed(3),
      '-t',  segDur.toFixed(3),
      '-i',  videoPath,
      '-vf', `fps=1/${interval.toFixed(3)},scale=640:-2`,
      '-q:v', '5',
      path.join(framesDir, 'frame_%04d.jpg'),
      '-y',
    ], { maxBuffer: 80 * 1024 * 1024 }, (err) => {
      if (err) { resolve([]); return }
      const files = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort()
      resolve(files.map((f, idx) => ({
        timestamp: segStart + idx * interval,
        b64: fs.readFileSync(path.join(framesDir, f)).toString('base64'),
      })))
    })
  })
}

/**
 * Whisper transcription.
 * Returns { segments: [{start, end, text}], text: timestamped string }.
 */
function whisperTranscribe(audioPath, apiKey) {
  return new Promise((resolve, reject) => {
    const boundary = `----FormBoundary${Date.now().toString(16)}`
    const audioData = fs.readFileSync(audioPath)
    const part1 = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`
    )
    const part2 = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1` +
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json` +
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\nsegment` +
      `\r\n--${boundary}--\r\n`
    )
    const body = Buffer.concat([part1, audioData, part2])
    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/audio/transcriptions', method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) { reject(new Error(parsed.error.message || JSON.stringify(parsed.error))); return }
          const segments = (parsed.segments || []).map(s => ({ start: s.start || 0, end: s.end || 0, text: s.text || '' }))
          const text = segments.map(s => {
            const m = Math.floor(s.start / 60); const sec = (s.start % 60).toFixed(1)
            return `[${m}:${sec}] ${s.text.trim()}`
          }).join('\n') || parsed.text || ''
          resolve({ segments, text })
        } catch (_) { reject(new Error('Whisper parse failed: ' + data.slice(0, 200))) }
      })
    })
    req.on('error', reject); req.write(body); req.end()
  })
}

/** Low-level GPT-4o call. `content` is an array of text/image_url parts. */
function callGPT4oRaw(content, apiKey, model, maxTokens) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      max_tokens: maxTokens,
      temperature: 0.3,
    })
    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) { reject(new Error(parsed.error.message || JSON.stringify(parsed.error))); return }
          let raw = (parsed.choices?.[0]?.message?.content || '').trim()
          if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
          resolve(JSON.parse(raw))
        } catch (e) { reject(new Error(`GPT-4o parse failed: ${e.message}  Raw: ${data.slice(0, 300)}`)) }
      })
    })
    req.on('error', reject); req.write(bodyStr); req.end()
  })
}

/**
 * Analyze a single segment with vision.
 * Returns array of {time, category, note} observations.
 */
async function analyzeSegment(frames, segTranscript, segStart, segEnd, who, doing, about, apiKey, model) {
  const ts = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

  const prompt = `You are an expert video performance coach. Analyze this segment of a recording (${ts(segStart)} – ${ts(segEnd)}).

CONTEXT:
- Person: ${who}
- Activity: ${doing}
- Video: ${about}

TRANSCRIPT FOR THIS SEGMENT:
${segTranscript || '[No audio detected in this segment]'}

The frames below cover this segment in order. Analyze them alongside the transcript above.

Return ONLY valid JSON — no markdown, no explanation:
{
  "observations": [
    { "time": <seconds from video start, number>, "category": "went_right|went_wrong|improve|work_on", "note": "<specific, concrete observation tied to a visible moment or transcript line>" }
  ]
}

Rules:
- Give 3–8 observations tightly tied to actual moments in this segment
- Every "time" value MUST be between ${segStart.toFixed(1)} and ${segEnd.toFixed(1)}
- went_right  → praiseworthy moment
- went_wrong  → clear mistake or weak delivery
- improve     → decent moment with a specific actionable tweak
- work_on     → recurring habit or skill gap (cite the representative moment here)
- Judge based on the context of "${doing}" — what matters here may not matter in a different setting`

  const content = [{ type: 'text', text: prompt }]
  for (const { timestamp, b64 } of frames) {
    const m = Math.floor(timestamp / 60), s = (timestamp % 60).toFixed(1)
    content.push({ type: 'text', text: `Frame at ${m}:${s}` })
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } })
  }

  const result = await callGPT4oRaw(content, apiKey, model, 1500)
  return (result.observations || []).filter(
    o => typeof o.time === 'number' && o.time >= segStart - 2 && o.time <= segEnd + 2
  )
}

/**
 * Final synthesis: text-only call that turns all segment observations
 * into a holistic summary + scores.
 */
async function synthesizeResults(allObservations, fullTranscriptText, duration, who, doing, about, apiKey, model) {
  const sorted = [...allObservations].sort((a, b) => a.time - b.time)
  const obsText = sorted.map(o => {
    const m = Math.floor(o.time / 60), s = (o.time % 60).toFixed(1)
    return `[${m}:${s}] [${o.category}] ${o.note}`
  }).join('\n')

  // Trim transcript to avoid token overflow on long videos
  const lines = fullTranscriptText.split('\n')
  const transcriptSample = lines.length > 150
    ? lines.slice(0, 80).join('\n') + '\n[…transcript continues…]\n' + lines.slice(-40).join('\n')
    : fullTranscriptText

  const prompt = `You are an expert communication coach. A video has been fully analyzed in segments, producing the ${sorted.length} timestamped observations listed below. Use them to write a final holistic assessment.

CONTEXT:
- Person: ${who}
- Activity: ${doing}
- Video: ${about}
- Duration: ${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s

FULL OBSERVATION LOG (${sorted.length} entries spanning the entire video):
${obsText}

TRANSCRIPT SAMPLE:
${transcriptSample || '[No transcript available]'}

Return ONLY valid JSON (no markdown):
{
  "summary": "<4–6 paragraphs. Open with the overall impression. Discuss specific strengths with timestamps. Discuss specific weaknesses with timestamps. Give concrete, actionable coaching advice. Close with what to prioritise first. Tailor everything to the context of '${doing}'.>",
  "scores": {
    "speech":        { "score": <0–10, one decimal>, "comment": "<1–2 sentence comment referencing actual moments>" },
    "clarity":       { "score": <0–10>, "comment": "..." },
    "confidence":    { "score": <0–10>, "comment": "..." },
    "body_language": { "score": <0–10>, "comment": "..." },
    "content":       { "score": <0–10>, "comment": "..." },
    "structure":     { "score": <0–10>, "comment": "..." },
    "engagement":    { "score": <0–10>, "comment": "..." },
    "eye_contact":   { "score": <0–10>, "comment": "..." },
    "pacing":        { "score": <0–10>, "comment": "..." },
    "overall":       { "score": <0–10>, "comment": "..." }
  }
}

Scoring guide: 5 = average, 7 = good, 9+ = exceptional. Be honest — never inflate to seem kind.`

  return await callGPT4oRaw([{ type: 'text', text: prompt }], apiKey, model, 3000)
}

// ── Settings ──────────────────────────────────────────────────────────────────
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) } catch (_) { return {} }
}
ipcMain.handle('get-settings', () => readSettings())
ipcMain.handle('save-settings', (_, settings) => {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8')
  return true
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function pathToUrl(p) {
  return 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '')
}
function sanitizeName(n) {
  return n.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'project'
}
function send(ch, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data)
}
function runFFmpeg(bin, args) {
  return new Promise((res, rej) => {
    const proc = spawn(bin, args, { windowsHide: true })
    let tail = ''
    proc.stderr?.on('data', d => { tail = (tail + d.toString()).slice(-5000) })
    proc.on('error', rej)
    proc.on('close', code => code === 0 ? res() : rej(new Error(`FFmpeg exit ${code}\n${tail}`)))
  })
}
function buildAtempo(speed) {
  const f = []
  let s = speed
  while (s > 2.0) { f.push('atempo=2.0'); s /= 2 }
  while (s < 0.5) { f.push('atempo=0.5'); s /= 0.5 }
  f.push(`atempo=${s.toFixed(6)}`)
  return f.join(',')
}
