// ═══════════════════════════════════════════════════════════════════════════
//  VIDEO ANALYZER — renderer
// ═══════════════════════════════════════════════════════════════════════════

let _id = 0
const uid = () => `id${++_id}`

// ── Project state ─────────────────────────────────────────────────────────────
const project = {
  file: null, dir: null, name: '',
  isPlaying: false,
  media:  [],  // { id, name, srcPath, mkvPath, url, duration, native }
  tracks: [{ id: uid(), name: 'Video 1', clips: [] }],
  zoom: 80, playhead: 0,
}

let appSettings = {}
let lastAnalysis = null  // stores the most recent analysis result

// ── Save / auto-save ──────────────────────────────────────────────────────────
let saveTimer = null
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveProject, 2000)
}
async function saveProject() {
  if (!project.file) return
  const data = {
    version: 1, name: project.name,
    media:  project.media.map(m => ({ id: m.id, name: m.name, srcPath: m.srcPath, mkvPath: m.mkvPath, duration: m.duration, native: m.native })),
    tracks: project.tracks,
    zoom: project.zoom, playhead: project.playhead,
  }
  await window.api.saveProject({ projectFile: project.file, data })
}

// ── Clip helpers ──────────────────────────────────────────────────────────────
const clipTlDur = c => c.sourceDuration / (c.speed || 1)
const clipEnd   = c => c.timelineStart + clipTlDur(c)
const totalDur  = () => Math.max(10, ...project.tracks.flatMap(t => t.clips.map(clipEnd))) + 4

function clipAtTime(time, trackIdx) {
  const t = project.tracks[trackIdx]
  return t ? (t.clips.find(c => time >= c.timelineStart && time < clipEnd(c)) || null) : null
}
function findClip(id) {
  for (const track of project.tracks) {
    const clip = track.clips.find(c => c.id === id)
    if (clip) return { clip, track }
  }
  return null
}
function sortedClips(trackIdx) {
  return (project.tracks[trackIdx]?.clips ?? []).slice().sort((a, b) => a.timelineStart - b.timelineStart)
}

// ── Snapping ──────────────────────────────────────────────────────────────────
function snapTime(time, excludeId = null) {
  const thresh = 8 / project.zoom
  let best = null, bestDist = thresh
  const check = t => { const d = Math.abs(t - time); if (d < bestDist) { bestDist = d; best = t } }
  check(0); check(project.playhead)
  for (const track of project.tracks)
    for (const clip of track.clips) {
      if (clip.id === excludeId) continue
      check(clip.timelineStart); check(clipEnd(clip))
    }
  return best
}

let selectedClipId = null

// ── DOM refs ──────────────────────────────────────────────────────────────────
const videoEl      = document.getElementById('video-el')
const noClipMsg    = document.getElementById('no-clip-msg')
const btnPlay      = document.getElementById('btn-play')
const timeDisplay  = document.getElementById('time-display')
const clipInfo     = document.getElementById('clip-info')
const mediaListEl  = document.getElementById('media-list')
const tlLabels     = document.getElementById('tl-labels')
const tlTracks     = document.getElementById('tl-tracks')
const tlScroll     = document.getElementById('tl-tracks-scroll')
const rulerWrap    = document.getElementById('ruler-wrap')
const rulerCanvas  = document.getElementById('ruler')
const playheadLine = document.getElementById('playhead-line')

// ── Playback ──────────────────────────────────────────────────────────────────
let rafId = null, playOriginTime = null, playOriginHead = 0, activeClipId = null

function startPlay() {
  if (project.isPlaying) return
  project.isPlaying = true; btnPlay.textContent = '⏸'
  playOriginTime = performance.now(); playOriginHead = project.playhead; activeClipId = null
  rafId = requestAnimationFrame(playLoop)
}
function stopPlay() {
  if (!project.isPlaying) return
  project.isPlaying = false; btnPlay.textContent = '▶'
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
  videoEl.pause(); activeClipId = null
}
function playLoop() {
  if (!project.isPlaying) return
  project.playhead = playOriginHead + (performance.now() - playOriginTime) / 1000
  if (project.playhead >= totalDur()) { project.playhead = 0; stopPlay(); render(); return }
  syncVideo(); updatePlayheadEl(); updateTimeDisplay()
  rafId = requestAnimationFrame(playLoop)
}
function syncVideo() {
  const clip = clipAtTime(project.playhead, 0)
  if (!clip) {
    if (!videoEl.paused) videoEl.pause()
    activeClipId = null; noClipMsg.style.display = 'block'; return
  }
  noClipMsg.style.display = 'none'
  const progress = project.playhead - clip.timelineStart
  const srcTime  = clip.sourceStart + progress * (clip.speed || 1)
  if (clip.id !== activeClipId) {
    activeClipId = clip.id
    if (videoEl.src !== clip.url) videoEl.src = clip.url
    videoEl.currentTime = srcTime; videoEl.playbackRate = clip.speed || 1
    if (project.isPlaying) videoEl.play().catch(() => {})
  } else {
    if (Math.abs(videoEl.currentTime - srcTime) > 0.25) videoEl.currentTime = srcTime
    videoEl.playbackRate = clip.speed || 1
    if (project.isPlaying && videoEl.paused) videoEl.play().catch(() => {})
  }
}
function seekTo(time) {
  const was = project.isPlaying
  if (was) stopPlay()
  project.playhead = Math.max(0, Math.min(time, totalDur()))
  syncVideo(); updatePlayheadEl(); updateTimeDisplay()
  if (was) { playOriginTime = performance.now(); playOriginHead = project.playhead; activeClipId = null; project.isPlaying = true; btnPlay.textContent = '⏸'; rafId = requestAnimationFrame(playLoop) }
}
function jumpPrev() {
  const all = project.tracks.flatMap(t => t.clips.flatMap(c => [c.timelineStart, clipEnd(c)])).sort((a, b) => a - b)
  const prev = [...all].reverse().find(t => t < project.playhead - 0.05)
  seekTo(prev != null ? prev : 0)
}
function jumpNext() {
  const all = project.tracks.flatMap(t => t.clips.flatMap(c => [c.timelineStart, clipEnd(c)])).sort((a, b) => a - b)
  const next = all.find(t => t > project.playhead + 0.05)
  if (next != null) seekTo(next)
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function render() { renderTracks(); renderRuler(); updatePlayheadEl(); updateTimeDisplay(); renderAnalysisMarkers() }

function renderTracks() {
  const totalPx = totalDur() * project.zoom
  tlLabels.innerHTML = ''
  Array.from(tlTracks.querySelectorAll('.track-row')).forEach(el => el.remove())

  project.tracks.forEach((track, ti) => {
    const lbl = document.createElement('div')
    lbl.className = 'tl-label'
    lbl.innerHTML = `<span class="tl-label-name">${track.name}</span><button class="btn-del-track" data-tid="${track.id}">×</button>`
    tlLabels.appendChild(lbl)

    const row = document.createElement('div')
    row.className = 'track-row'
    row.dataset.ti = ti; row.dataset.tid = track.id
    row.style.width = totalPx + 'px'

    track.clips.forEach(clip => {
      const el = document.createElement('div')
      el.className = 'clip' + (clip.id === selectedClipId ? ' selected' : '')
      el.dataset.cid = clip.id
      el.style.left  = (clip.timelineStart * project.zoom) + 'px'
      el.style.width = Math.max(4, clipTlDur(clip) * project.zoom) + 'px'
      el.innerHTML = `<div class="clip-name">${clip.name}</div>${clip.speed !== 1 ? `<div class="clip-speed">${clip.speed}×</div>` : ''}`
      row.appendChild(el)
    })
    tlTracks.insertBefore(row, playheadLine)
  })
  tlTracks.style.width    = totalPx + 'px'
  tlTracks.style.minHeight = (project.tracks.length * 52) + 'px'
}

function renderRuler() {
  const total = totalDur()
  const width = Math.max(total * project.zoom, tlScroll.clientWidth || 800)
  rulerCanvas.width = width; rulerCanvas.height = 26
  const ctx = rulerCanvas.getContext('2d')
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0, 0, width, 26)
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]
  const interval   = candidates.find(c => c * project.zoom >= 60) || 300
  const minor = interval / 2
  ctx.font = '9px monospace'; ctx.textBaseline = 'top'
  for (let t = 0; t <= total + interval; t += interval) {
    const x = Math.round(t * project.zoom) + 0.5
    if (x > width) break
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, 26); ctx.stroke()
    ctx.fillStyle = '#666'; ctx.fillText(fmtTime(t), x + 2, 3)
  }
  if (minor * project.zoom > 10) {
    ctx.strokeStyle = '#2e2e2e'
    for (let t = minor; t <= total + minor; t += interval) {
      const x = Math.round(t * project.zoom) + 0.5
      if (x > width) break
      ctx.beginPath(); ctx.moveTo(x, 22); ctx.lineTo(x, 26); ctx.stroke()
    }
  }
}

function updatePlayheadEl() {
  playheadLine.style.left = (project.playhead * project.zoom) + 'px'
}
function updateTimeDisplay() {
  timeDisplay.textContent = `${fmtTime(project.playhead)} / ${fmtTime(totalDur())}`
  const clip = clipAtTime(project.playhead, 0)
  clipInfo.textContent = clip ? `${clip.name}${clip.speed !== 1 ? '  ' + clip.speed + '×' : ''}` : ''
  noClipMsg.style.display = (!clip && !project.isPlaying) ? 'block' : 'none'
}
const fmtTime = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

// ── Analysis markers on timeline ──────────────────────────────────────────────
function renderAnalysisMarkers() {
  tlTracks.querySelectorAll('.ts-marker').forEach(m => m.remove())
  if (!lastAnalysis?.timestamps) return
  lastAnalysis.timestamps.forEach(ts => {
    const marker = document.createElement('div')
    marker.className = `ts-marker ts-marker-${ts.category.replace('_', '-')}`
    marker.style.left = (ts.time * project.zoom) + 'px'
    marker.title = `[${fmtTime(ts.time)}] ${ts.note}`
    tlTracks.insertBefore(marker, playheadLine)
  })
}

// ── Edit operations ────────────────────────────────────────────────────────────
function splitAtPlayhead() {
  let changed = false
  project.tracks.forEach(track => {
    const clip = track.clips.find(c => project.playhead > c.timelineStart + 0.02 && project.playhead < clipEnd(c) - 0.02)
    if (!clip) return
    const progress = project.playhead - clip.timelineStart
    const splitSrc = clip.sourceStart + progress * (clip.speed || 1)
    const leftDur  = splitSrc - clip.sourceStart
    const rightDur = clip.sourceDuration - leftDur
    if (leftDur < 0.02 || rightDur < 0.02) return
    const A = { ...clip, id: uid(), sourceDuration: leftDur }
    const B = { ...clip, id: uid(), sourceStart: splitSrc, sourceDuration: rightDur, timelineStart: project.playhead }
    track.clips.splice(track.clips.indexOf(clip), 1, A, B)
    changed = true
  })
  if (changed) { render(); scheduleSave() }
}
function deleteSelected() {
  if (!selectedClipId) return
  const found = findClip(selectedClipId)
  if (!found) return
  found.track.clips = found.track.clips.filter(c => c.id !== selectedClipId)
  selectedClipId = null; render(); scheduleSave()
}
function rippleDelete() {
  if (!selectedClipId) return
  const found = findClip(selectedClipId)
  if (!found) return
  const { clip, track } = found
  const clipEndTime = clipEnd(clip); const gap = clipTlDur(clip)
  track.clips = track.clips.filter(c => c.id !== selectedClipId)
  for (const t of project.tracks)
    for (const c of t.clips)
      if (c.timelineStart >= clipEndTime - 0.001) c.timelineStart -= gap
  selectedClipId = null; render(); scheduleSave()
}
function applySpeed(speed) {
  if (!selectedClipId) return
  const found = findClip(selectedClipId)
  if (!found) return
  found.clip.speed = speed; render(); scheduleSave()
}
function addTrack() {
  project.tracks.push({ id: uid(), name: `Video ${project.tracks.length + 1}`, clips: [] })
  render(); scheduleSave()
}
function removeTrack(tid) {
  if (project.tracks.length <= 1) return
  project.tracks = project.tracks.filter(t => t.id !== tid)
  render(); scheduleSave()
}
function addMediaToTimeline(mediaId, trackIdx = 0) {
  const media = project.media.find(m => m.id === mediaId)
  const track = project.tracks[trackIdx]
  if (!media || !track) return
  const end = track.clips.reduce((mx, c) => Math.max(mx, clipEnd(c)), 0)
  const clip = { id: uid(), name: media.name, trackId: track.id, url: media.url, mkvPath: media.mkvPath, sourceStart: 0, sourceDuration: media.duration || 5, timelineStart: end, speed: 1 }
  track.clips.push(clip); selectedClipId = clip.id; render(); scheduleSave()
}

// ── Context menu ──────────────────────────────────────────────────────────────
const ctxMenu = document.getElementById('ctx-menu')
let ctxClipId = null

function showCtx(x, y, clipId) {
  ctxClipId = clipId; selectedClipId = clipId; render()
  ctxMenu.style.left = x + 'px'; ctxMenu.style.top = y + 'px'
  ctxMenu.classList.remove('hidden')
  const r = ctxMenu.getBoundingClientRect()
  if (r.right  > window.innerWidth)  ctxMenu.style.left = (x - r.width) + 'px'
  if (r.bottom > window.innerHeight) ctxMenu.style.top  = (y - r.height) + 'px'
}
function hideCtx() { ctxMenu.classList.add('hidden'); ctxClipId = null }

ctxMenu.addEventListener('click', e => {
  const item = e.target.closest('.ctx-item')
  if (!item) return
  const action = item.dataset.action; hideCtx()
  if      (action === 'split')              splitAtPlayhead()
  else if (action === 'delete')             deleteSelected()
  else if (action === 'ripple')             rippleDelete()
  else if (action?.startsWith('speed:'))   applySpeed(parseFloat(action.split(':')[1]))
})
document.addEventListener('mousedown', e => { if (!ctxMenu.contains(e.target)) hideCtx() })

// ── Clip dragging ─────────────────────────────────────────────────────────────
let drag = null, snapLine = null

function ensureSnapLine() {
  if (!snapLine) { snapLine = document.createElement('div'); snapLine.id = 'snap-line'; tlTracks.appendChild(snapLine) }
}
function startDrag(e, clipId) {
  e.preventDefault()
  const found = findClip(clipId)
  if (!found) return
  drag = { clipId, startX: e.clientX, startY: e.clientY, origStart: found.clip.timelineStart, origTrackId: found.track.id, moved: false }
}
document.addEventListener('mousemove', e => {
  if (!drag) return
  const dx = e.clientX - drag.startX
  if (!drag.moved && Math.abs(dx) < 3) return
  drag.moved = true
  const found = findClip(drag.clipId)
  if (!found) return
  const { clip, track } = found
  let newStart = Math.max(0, drag.origStart + dx / project.zoom)
  const snapped    = snapTime(newStart, drag.clipId)
  const snappedEnd = snapTime(newStart + clipTlDur(clip), drag.clipId)
  if (snapped !== null)    { newStart = snapped; showSnapLine(snapped) }
  else if (snappedEnd !== null) { newStart = snappedEnd - clipTlDur(clip); showSnapLine(snappedEnd) }
  else hideSnapLine()
  clip.timelineStart = newStart
  const rows = Array.from(tlTracks.querySelectorAll('.track-row'))
  for (const row of rows) {
    const r = row.getBoundingClientRect()
    if (e.clientY >= r.top && e.clientY <= r.bottom) {
      const newTi = parseInt(row.dataset.ti, 10)
      const newTrack = project.tracks[newTi]
      if (newTrack && newTrack.id !== clip.trackId) {
        track.clips = track.clips.filter(c => c.id !== clip.id)
        clip.trackId = newTrack.id; newTrack.clips.push(clip)
      }
      break
    }
  }
  render()
})
document.addEventListener('mouseup', () => {
  if (drag?.moved) { scheduleSave(); hideSnapLine() }
  drag = null
})
function showSnapLine(time) { ensureSnapLine(); snapLine.style.left = (time * project.zoom) + 'px'; snapLine.style.display = 'block' }
function hideSnapLine()     { if (snapLine) snapLine.style.display = 'none' }

// ── Timeline interaction ──────────────────────────────────────────────────────
tlScroll.addEventListener('mousedown', e => {
  const clipEl = e.target.closest('.clip')
  if (clipEl) {
    if (e.button === 0) { selectedClipId = clipEl.dataset.cid; render(); startDrag(e, clipEl.dataset.cid) }
    return
  }
  if (e.button === 0) {
    selectedClipId = null
    const rect = tlScroll.getBoundingClientRect()
    seekTo((e.clientX - rect.left + tlScroll.scrollLeft) / project.zoom)
    render()
  }
})
rulerWrap.addEventListener('mousedown', e => {
  if (e.button !== 0) return
  const rect = rulerWrap.getBoundingClientRect()
  seekTo((e.clientX - rect.left + tlScroll.scrollLeft) / project.zoom)
})
tlScroll.addEventListener('contextmenu', e => {
  e.preventDefault()
  const clipEl = e.target.closest('.clip')
  if (clipEl) showCtx(e.clientX, e.clientY, clipEl.dataset.cid)
})
tlScroll.addEventListener('scroll', () => {
  rulerWrap.scrollLeft = tlScroll.scrollLeft
  tlLabels.scrollTop   = tlScroll.scrollTop
})

// ── Ctrl+Scroll zoom ──────────────────────────────────────────────────────────
function zoomAtMouse(e, containerEl) {
  e.preventDefault()
  const rect = containerEl.getBoundingClientRect()
  const mouseTimeSec = (e.clientX - rect.left + tlScroll.scrollLeft) / project.zoom
  const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2
  project.zoom = Math.max(4, Math.min(600, project.zoom * factor))
  render()
  const newLeft = mouseTimeSec * project.zoom - (e.clientX - rect.left)
  requestAnimationFrame(() => { tlScroll.scrollLeft = Math.max(0, newLeft) })
}
tlScroll.addEventListener('wheel', e => { if (e.ctrlKey) zoomAtMouse(e, tlScroll)  }, { passive: false })
rulerWrap.addEventListener('wheel', e => { if (e.ctrlKey) zoomAtMouse(e, rulerWrap) }, { passive: false })

// ── Toolbar events ────────────────────────────────────────────────────────────
document.getElementById('btn-import').addEventListener('click', importFiles)
document.getElementById('btn-import-yt').addEventListener('click', openYoutubeModal)
document.getElementById('btn-split').addEventListener('click', splitAtPlayhead)
document.getElementById('btn-delete').addEventListener('click', deleteSelected)
document.getElementById('btn-ripple').addEventListener('click', rippleDelete)
document.getElementById('btn-add-track').addEventListener('click', addTrack)
document.getElementById('btn-apply-speed').addEventListener('click',
  () => applySpeed(parseFloat(document.getElementById('speed-select').value)))
document.getElementById('btn-play').addEventListener('click', () => project.isPlaying ? stopPlay() : startPlay())
document.getElementById('btn-prev-clip').addEventListener('click', jumpPrev)
document.getElementById('btn-next-clip').addEventListener('click', jumpNext)
document.getElementById('btn-zoom-in').addEventListener('click',  () => { project.zoom = Math.min(project.zoom * 1.5, 600); render() })
document.getElementById('btn-zoom-out').addEventListener('click', () => { project.zoom = Math.max(project.zoom / 1.5, 4);  render() })
document.getElementById('btn-save').addEventListener('click', saveProject)
document.getElementById('btn-export').addEventListener('click', exportVideo)
document.getElementById('btn-analyze').addEventListener('click', openAnalyzeModal)

tlLabels.addEventListener('click', e => {
  const btn = e.target.closest('.btn-del-track')
  if (btn) removeTrack(btn.dataset.tid)
})
mediaListEl.addEventListener('click', e => {
  const item = e.target.closest('.media-item')
  if (item) addMediaToTimeline(item.dataset.mid)
})

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveProject(); return }
  switch (e.key) {
    case ' ':           e.preventDefault(); project.isPlaying ? stopPlay() : startPlay(); break
    case 's': case 'S': splitAtPlayhead(); break
    case 'Delete': case 'Backspace': e.shiftKey ? rippleDelete() : deleteSelected(); break
    case '[': jumpPrev(); break
    case ']': jumpNext(); break
    case '+': case '=': project.zoom = Math.min(project.zoom * 1.5, 600); render(); break
    case '-':           project.zoom = Math.max(project.zoom / 1.5, 4);  render(); break
  }
})

// ── Import ────────────────────────────────────────────────────────────────────
async function importFiles() {
  const paths = await window.api.openFiles()
  if (!paths?.length) return
  const overlay = document.getElementById('import-overlay')
  const prog    = document.getElementById('import-prog')
  const msg     = document.getElementById('import-msg')
  overlay.classList.remove('hidden')

  for (let i = 0; i < paths.length; i++) {
    const srcPath = paths[i]
    if (project.media.find(m => m.srcPath === srcPath)) continue
    const name = srcPath.replace(/\\/g, '/').split('/').pop()
    const mediaId = uid()
    prog.style.width = Math.round((i / paths.length) * 80) + '%'
    msg.textContent  = `Converting ${name}…`
    const result   = await window.api.importToMkv({ sourcePath: srcPath, mediaId })
    const duration = await getVideoDuration(result.url)
    const item = { id: mediaId, name, srcPath, mkvPath: result.mkvPath, url: result.url, duration, native: result.native }
    project.media.push(item)
    addMediaItemToUI(item)
    mediaListEl.querySelector('.hint')?.remove()
  }
  prog.style.width = '100%'
  setTimeout(() => overlay.classList.add('hidden'), 300)
  scheduleSave()
}

function addMediaItemToUI(media) {
  const el = document.createElement('div')
  el.className = 'media-item'; el.dataset.mid = media.id
  el.innerHTML = `<div class="mi-name">${media.name}</div><div class="mi-dur">${fmtTime(media.duration || 0)}${media.native ? '' : ' <span class="mi-badge">MKV</span>'}</div>`
  mediaListEl.appendChild(el)
}

function getVideoDuration(url) {
  return new Promise(resolve => {
    const v = document.createElement('video')
    v.preload = 'metadata'; v.src = url
    v.onloadedmetadata = () => resolve(v.duration || 0)
    v.onerror = () => resolve(0)
    setTimeout(() => resolve(0), 8000)
  })
}

// ── YouTube import ────────────────────────────────────────────────────────────
let ytDlpAvailable = false

async function openYoutubeModal() {
  const status = await window.api.getYtDlpStatus()
  ytDlpAvailable = status.available

  const warn = document.getElementById('yt-warn')
  const dlBtn = document.getElementById('yt-download')
  warn.classList.toggle('hidden', ytDlpAvailable)
  dlBtn.disabled = !ytDlpAvailable

  document.getElementById('yt-url').value = ''
  document.getElementById('yt-video-info').classList.add('hidden')
  document.getElementById('youtube-modal').classList.remove('hidden')

  // Auto-paste if clipboard contains a YouTube URL
  try {
    const text = await navigator.clipboard.readText()
    if (/youtube\.com\/|youtu\.be\//.test(text)) {
      document.getElementById('yt-url').value = text
    }
  } catch (_) {}
}

document.getElementById('yt-cancel').addEventListener('click', () =>
  document.getElementById('youtube-modal').classList.add('hidden'))

document.getElementById('yt-paste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText()
    document.getElementById('yt-url').value = text
  } catch (_) { alert('Could not read clipboard. Paste manually.') }
})

document.getElementById('yt-download').addEventListener('click', async () => {
  const url     = document.getElementById('yt-url').value.trim()
  const quality = document.getElementById('yt-quality').value

  if (!url) { alert('Paste a YouTube URL first.'); return }
  if (!/youtube\.com\/|youtu\.be\/|youtube-nocookie\.com\//.test(url)) {
    if (!confirm('This doesn\'t look like a YouTube URL. Continue anyway?')) return
  }
  if (!project.file) { alert('Create or open a project first so the download has somewhere to save.'); return }

  document.getElementById('youtube-modal').classList.add('hidden')

  // Show progress overlay
  const overlay = document.getElementById('youtube-overlay')
  const progEl  = document.getElementById('yt-prog')
  const stepEl  = document.getElementById('yt-step')
  const logEl   = document.getElementById('yt-log')
  overlay.classList.remove('hidden')
  progEl.style.width = '2%'
  stepEl.textContent = 'Starting download…'
  logEl.textContent  = ''

  const result = await window.api.importYoutube({ url, quality })

  if (!result.success) {
    overlay.classList.add('hidden')
    alert('YouTube download failed:\n\n' + result.error)
    return
  }

  // ── Auto-import the downloaded file the same way as a local file ──────────
  stepEl.textContent = 'Converting to working copy…'
  progEl.style.width = '97%'

  const srcPath = result.filePath
  const name    = result.title
    ? result.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) + '.mp4'
    : srcPath.replace(/\\/g, '/').split('/').pop()

  const mediaId  = uid()
  const imported = await window.api.importToMkv({ sourcePath: srcPath, mediaId })
  const duration = await getVideoDuration(imported.url)

  const item = {
    id: mediaId, name, srcPath,
    mkvPath:  imported.mkvPath,
    url:      imported.url,
    duration, native: imported.native,
  }
  project.media.push(item)
  mediaListEl.querySelector('.hint')?.remove()
  addMediaItemToUI(item)

  // Auto-add to timeline track 0
  addMediaToTimeline(mediaId, 0)

  progEl.style.width = '100%'
  setTimeout(() => { overlay.classList.add('hidden'); progEl.style.width = '0%' }, 600)

  scheduleSave()
})

window.api.onYoutubeProgress(({ pct, step }) => {
  if (pct !== null && pct !== undefined) {
    document.getElementById('yt-prog').style.width = Math.max(2, pct) + '%'
  }
  if (step) {
    document.getElementById('yt-step').textContent = step.replace(/\[download\]\s*/i, '')
    const log = document.getElementById('yt-log')
    if (step.includes('%') || step.includes('[') ) {
      log.textContent = step + '\n' + log.textContent
      log.textContent = log.textContent.split('\n').slice(0, 20).join('\n')
    }
  }
})

// ── Export ────────────────────────────────────────────────────────────────────
async function exportVideo() {
  const clips = sortedClips(0).map(c => ({ mkvPath: c.mkvPath, sourceStart: c.sourceStart, sourceDuration: c.sourceDuration, speed: c.speed || 1 }))
  if (!clips.length) { alert('No clips on Video 1 to export.'); return }
  const out = await window.api.saveFile('output.mp4')
  if (!out) return
  document.getElementById('export-overlay').classList.remove('hidden')
  document.getElementById('export-prog').style.width = '0%'
  const result = await window.api.exportVideo({ clips, outputPath: out })
  document.getElementById('export-overlay').classList.add('hidden')
  result.success ? alert('Export complete!\n' + out) : alert('Export failed:\n' + result.error)
}
window.api.onExportProgress(({ step, total, msg }) => {
  document.getElementById('export-prog').style.width = Math.round(step / total * 100) + '%'
  document.getElementById('export-msg').textContent  = msg
})

// ── Analyze modal ─────────────────────────────────────────────────────────────
function openAnalyzeModal() {
  const hasClips = project.tracks.some(t => t.clips.length > 0)
  if (!hasClips) { alert('Import a video and add it to the timeline first.'); return }

  const warn = document.getElementById('am-key-warn')
  warn.classList.toggle('hidden', !!(appSettings.openaiKey || '').trim())
  document.getElementById('analyze-modal').classList.remove('hidden')
}

document.getElementById('am-open-settings').addEventListener('click', e => {
  e.preventDefault()
  document.getElementById('analyze-modal').classList.add('hidden')
  document.getElementById('st-openai-key').value = appSettings.openaiKey || ''
  document.getElementById('settings-modal').classList.remove('hidden')
})
document.getElementById('am-cancel').addEventListener('click', () =>
  document.getElementById('analyze-modal').classList.add('hidden'))

document.getElementById('am-run').addEventListener('click', async () => {
  const who   = document.getElementById('am-who').value.trim()
  const doing = document.getElementById('am-doing').value.trim()
  const about = document.getElementById('am-about').value.trim()
  const model = document.getElementById('am-model').value

  if (!who)   { alert('Please describe who you are in the video.'); return }
  if (!doing) { alert('Please describe what you are doing in the video.'); return }
  if (!about) { alert('Please describe what the video is about.'); return }

  const openaiKey = (appSettings.openaiKey || '').trim()
  if (!openaiKey) { alert('An OpenAI API key is required. Add it in Settings (⚙).'); return }

  document.getElementById('analyze-modal').classList.add('hidden')

  // Pick the video to analyze — first clip on track 0
  const clips = sortedClips(0)
  if (!clips.length) { alert('No clips on Video 1 to analyze.'); return }
  const videoPath = clips[0].mkvPath

  // Show progress overlay
  const overlay = document.getElementById('analyze-overlay')
  const progEl  = document.getElementById('analyze-prog')
  const stepEl  = document.getElementById('analyze-step')
  const logEl   = document.getElementById('analyze-log')
  overlay.classList.remove('hidden')
  progEl.style.width = '2%'; stepEl.textContent = 'Starting…'; logEl.textContent = ''

  const result = await window.api.analyzeVideo({ videoPath, who, doing, about, openaiKey, model })
  overlay.classList.add('hidden')
  progEl.style.width = '0%'

  if (!result.success) {
    alert('Analysis failed:\n' + result.error)
    return
  }

  lastAnalysis = result
  showAnalysisPanel(result)
})

window.api.onAnalyzeProgress(({ step, total, msg }) => {
  if (step != null && total != null) {
    // Reserve the last 5% for synthesis so the bar never jumps back
    const pct = step >= total
      ? 98
      : Math.min(93, Math.round((step / total) * 95))
    document.getElementById('analyze-prog').style.width = pct + '%'
  }
  if (msg) {
    document.getElementById('analyze-step').textContent = msg
    const log = document.getElementById('analyze-log')
    log.textContent = msg + (log.textContent ? '\n' + log.textContent : '')
    // Keep log from growing too long
    const lines = log.textContent.split('\n')
    if (lines.length > 30) log.textContent = lines.slice(0, 30).join('\n')
  }
})

// ── Analysis Panel ────────────────────────────────────────────────────────────
const SCORE_LABELS = {
  speech:        'Speech & Articulation',
  clarity:       'Clarity of Message',
  confidence:    'Confidence & Presence',
  body_language: 'Body Language',
  content:       'Content Quality',
  structure:     'Structure & Flow',
  engagement:    'Engagement',
  eye_contact:   'Eye Contact',
  pacing:        'Pacing',
  overall:       'Overall',
}
const BADGE_CONFIG = {
  went_right: { label: '✓ Went Right',  cls: 'badge-went-right', itemCls: 'ts-went-right' },
  went_wrong: { label: '✗ Went Wrong',  cls: 'badge-went-wrong', itemCls: 'ts-went-wrong' },
  improve:    { label: '↑ Improve',     cls: 'badge-improve',    itemCls: 'ts-improve'    },
  work_on:    { label: '⟳ Work On',     cls: 'badge-work-on',    itemCls: 'ts-work-on'    },
}

function showAnalysisPanel(data) {
  // Hide the empty nudge, show the panel
  document.getElementById('right-panel-empty').classList.add('hidden')
  const panel = document.getElementById('right-panel')
  panel.classList.remove('hidden')

  // Render timestamps
  renderTimestamps(data.timestamps || [], 'all')

  // Render summary
  const summaryEl = document.getElementById('summary-text')
  const paragraphs = (data.summary || 'No summary available.').split(/\n\n+/)
  summaryEl.innerHTML = paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')

  // Render scores
  renderScores(data.scores || {})

  // Draw analysis markers on the timeline
  render()
}

let activeFilter = 'all'

function renderTimestamps(timestamps, filter) {
  activeFilter = filter

  // Update filter buttons
  document.querySelectorAll('.ts-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === filter)
  })

  const list = document.getElementById('ts-list')
  list.innerHTML = ''

  const items = filter === 'all' ? timestamps : timestamps.filter(ts => ts.category === filter)
  if (!items.length) {
    list.innerHTML = '<div class="hint" style="padding:20px 10px">No items in this category.</div>'
    return
  }

  const sorted = [...items].sort((a, b) => a.time - b.time)
  sorted.forEach(ts => {
    const cfg = BADGE_CONFIG[ts.category] || BADGE_CONFIG.improve
    const el  = document.createElement('div')
    el.className = `ts-item ${cfg.itemCls}`
    el.dataset.time = ts.time
    el.innerHTML = `
      <div class="ts-header">
        <div class="ts-time">${fmtTime(ts.time)}</div>
        <div class="ts-badge ${cfg.cls}">${cfg.label}</div>
      </div>
      <div class="ts-note">${ts.note}</div>
    `
    el.addEventListener('click', () => seekTo(ts.time))
    list.appendChild(el)
  })
}

function renderScores(scores) {
  // Overall badge
  const overall = scores.overall || { score: 0, comment: '' }
  const overallPct = Math.round((overall.score / 10) * 100)
  const overallColor = overall.score >= 7.5 ? '#27ae60' : overall.score >= 5 ? '#e67e22' : '#c0392b'
  document.getElementById('scores-overall-badge').innerHTML = `
    <div class="overall-score-num" style="color:${overallColor}">${overall.score.toFixed(1)}<span class="overall-score-denom">/10</span></div>
    <div class="overall-label">Overall Score</div>
    <div class="overall-comment">${overall.comment || ''}</div>
  `

  // Individual score cards
  const list = document.getElementById('scores-list')
  list.innerHTML = ''

  const order = ['speech', 'clarity', 'confidence', 'body_language', 'content', 'structure', 'engagement', 'eye_contact', 'pacing']
  order.forEach(key => {
    const s = scores[key]
    if (!s) return
    const pct   = Math.round((s.score / 10) * 100)
    const grade = s.score >= 7.5 ? 'grade-high' : s.score >= 5 ? 'grade-mid' : 'grade-low'
    const color = s.score >= 7.5 ? '#6fcf97' : s.score >= 5 ? '#f0b27a' : '#f1948a'
    const label = SCORE_LABELS[key] || key.replace(/_/g, ' ')
    const card  = document.createElement('div')
    card.className = 'score-card'
    card.innerHTML = `
      <div class="score-header">
        <span class="score-name">${label}</span>
        <span class="score-value" style="color:${color}">${s.score.toFixed(1)}</span>
      </div>
      <div class="score-bar-bg">
        <div class="score-bar ${grade}" style="width:${pct}%"></div>
      </div>
      <div class="score-comment">${s.comment || ''}</div>
    `
    list.appendChild(card)
  })
}

// Filter buttons
document.getElementById('ts-filter-bar').addEventListener('click', e => {
  const btn = e.target.closest('.ts-filter')
  if (!btn || !lastAnalysis) return
  renderTimestamps(lastAnalysis.timestamps || [], btn.dataset.cat)
})

// Right panel tabs
document.getElementById('rp-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.rtab')
  if (!btn) return
  document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.rtab-content').forEach(c => c.classList.add('hidden'))
  btn.classList.add('active')
  document.getElementById('rtab-' + btn.dataset.rtab).classList.remove('hidden')
})

// Close panel
document.getElementById('btn-close-panel').addEventListener('click', () => {
  document.getElementById('right-panel').classList.add('hidden')
  document.getElementById('right-panel-empty').classList.remove('hidden')
})

// ── Settings modal ────────────────────────────────────────────────────────────
document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('st-openai-key').value = appSettings.openaiKey || ''
  document.getElementById('settings-modal').classList.remove('hidden')
})
document.getElementById('st-cancel').addEventListener('click', () =>
  document.getElementById('settings-modal').classList.add('hidden'))
document.getElementById('st-toggle-key').addEventListener('click', () => {
  const inp = document.getElementById('st-openai-key')
  const btn = document.getElementById('st-toggle-key')
  if (inp.type === 'password') { inp.type = 'text';     btn.textContent = 'Hide' }
  else                         { inp.type = 'password'; btn.textContent = 'Show' }
})
document.getElementById('st-save').addEventListener('click', async () => {
  appSettings.openaiKey = document.getElementById('st-openai-key').value.trim()
  await window.api.saveSettings(appSettings)
  document.getElementById('settings-modal').classList.add('hidden')
})

// ── Project loading ───────────────────────────────────────────────────────────
function loadProjectData(data, file, dir) {
  project.file = file; project.dir = dir
  project.name = data.name || ''; project.zoom = data.zoom || 80
  project.playhead = data.playhead || 0; project.isPlaying = false

  const allIds = [...(data.media || []), ...(data.tracks || []).flatMap(t => [t, ...(t.clips || [])])].map(x => x.id).filter(Boolean)
  allIds.forEach(id => { const n = parseInt(id.replace('id', '')); if (n > _id) _id = n })

  project.media = (data.media || []).map(m => ({ ...m, url: pathToFileUrl(m.mkvPath) }))
  project.tracks = (data.tracks || [{ id: uid(), name: 'Video 1', clips: [] }])
  project.tracks.forEach(track => {
    track.clips = (track.clips || []).map(c => ({ ...c, url: pathToFileUrl(c.mkvPath) }))
  })

  document.getElementById('project-name-label').textContent = project.name
  document.title = project.name + ' — Video Analyzer'

  mediaListEl.innerHTML = ''
  if (!project.media.length) mediaListEl.innerHTML = '<div class="hint">Click Import to add videos</div>'
  project.media.forEach(m => addMediaItemToUI(m))

  render()
}
function pathToFileUrl(p) {
  if (!p) return ''
  return 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '')
}

// ═══════════════════════════════════════════════════════════════════════════
//  STARTUP / PROJECT PICKER
// ═══════════════════════════════════════════════════════════════════════════
const startupScreen = document.getElementById('startup-screen')
const editorScreen  = document.getElementById('editor-screen')

function showEditor() {
  startupScreen.classList.add('hidden')
  editorScreen.classList.remove('hidden')
  // Show empty panel nudge on the right
  document.getElementById('right-panel-empty').classList.remove('hidden')
  render()
}

async function initStartup() {
  const recents = await window.api.getRecentProjects()
  const list    = document.getElementById('recent-list')
  list.innerHTML = ''
  if (!recents.length) { list.innerHTML = '<div class="hint">No recent projects</div>'; return }
  recents.forEach(filePath => {
    const name = filePath.replace(/\\/g, '/').split('/').pop().replace('.vap', '')
    const dir  = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const el   = document.createElement('div')
    el.className = 'recent-item'
    el.innerHTML = `<div><div class="ri-name">${name}</div><div class="ri-path">${dir}</div></div>`
    el.addEventListener('click', async () => {
      try {
        const { data, projectFile } = await window.api.openProject(filePath)
        const proj = await window.api.getActiveProject()
        loadProjectData(data, projectFile, proj?.dir || '')
        showEditor()
      } catch (_) { alert('Could not open project: ' + filePath) }
    })
    list.appendChild(el)
  })
}

// New project
let newProjectFolder = null
document.getElementById('btn-new-project').addEventListener('click', () => {
  newProjectFolder = null
  document.getElementById('np-name').value   = 'My Analysis'
  document.getElementById('np-folder').value = ''
  document.getElementById('new-project-modal').classList.remove('hidden')
})
document.getElementById('np-browse').addEventListener('click', async () => {
  const folder = await window.api.pickProjectFolder()
  if (folder) { newProjectFolder = folder; document.getElementById('np-folder').value = folder }
})
document.getElementById('np-cancel').addEventListener('click', () =>
  document.getElementById('new-project-modal').classList.add('hidden'))
document.getElementById('np-create').addEventListener('click', async () => {
  const name = document.getElementById('np-name').value.trim()
  if (!name) { alert('Enter a project name'); return }
  if (!newProjectFolder) { alert('Choose a folder'); return }
  document.getElementById('new-project-modal').classList.add('hidden')
  const { data, projectFile } = await window.api.createProject({ folderPath: newProjectFolder, name })
  const proj = await window.api.getActiveProject()
  loadProjectData(data, projectFile, proj?.dir || newProjectFolder)
  showEditor()
})

// Open project
document.getElementById('btn-open-project').addEventListener('click', async () => {
  const filePath = await window.api.pickProjectFile()
  if (!filePath) return
  const { data, projectFile } = await window.api.openProject(filePath)
  const proj = await window.api.getActiveProject()
  loadProjectData(data, projectFile, proj?.dir || '')
  showEditor()
})

window.addEventListener('resize', () => renderRuler())

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  appSettings = await window.api.getSettings() || {}
  initStartup()
}
init()
