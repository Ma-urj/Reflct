# Reflct — AI Video Performance Coach

Reflct is an AI-powered desktop tool that analyzes any video recording and gives you detailed, timestamped coaching feedback — what you did well, what went wrong, how to improve, and what to work on — across speech, clarity, confidence, body language, content, and more.

It is built for anyone who records themselves and wants honest, specific feedback: job interviewees reviewing mock interviews, sales reps replaying client calls, content creators reviewing vlogs, public speakers watching back presentations, coaches reviewing athlete footage, or anyone learning to communicate better on camera.

It combines a full non-linear video editor with a YouTube downloader and a multi-pass AI analysis engine that processes the entire video — never just a sample — and synthesizes every observation into a structured coaching report with timestamped notes, a written summary, and numerical scores.

---

## Demo

![Reflct Demo](GifAnalyze.gif)

> 🎯 Watch yourself. Understand what happened. Get better.

---

## About the Demo

This is a **v1 application**. Analysis quality is directly proportional to how well you describe the context before running it. The three-question form — who you are, what you're doing, what the video is about — is what allows the AI to judge the right things. An interviewer's camera discipline is judged differently from a vlogger's. A sales rep's eye contact matters differently from a teacher's.

The more specific and honest you are in those fields, the more specific and honest the feedback will be.

**The analysis engine runs multiple GPT-4o Vision calls**, one per video segment, so every part of the video is seen — not just sampled. A 20-minute video is analyzed in 6–7 passes, then a final synthesis call combines all observations into the report. This takes longer than a single call but produces far more thorough results.

**YouTube import requires `yt-dlp`**, which is a separate install (see Setup). Once installed, paste any YouTube URL directly into the app to download, convert, and drop the video onto the timeline automatically.

**Contributions are welcome.** If you add a new scoring category, improve the segment analysis prompt, add a new download source, or fix something broken — open a PR.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Feature Set](#2-feature-set)
3. [Setup & Running](#3-setup--running)
4. [App Layout](#4-app-layout)
5. [Keyboard Shortcuts](#5-keyboard-shortcuts)
6. [Editing Guide](#6-editing-guide)
7. [YouTube Import](#7-youtube-import)
8. [Video Analysis](#8-video-analysis)
9. [The Analysis Panel](#9-the-analysis-panel)
10. [Settings](#10-settings)
11. [Export](#11-export)
12. [Project Files](#12-project-files)
13. [Architecture](#13-architecture)
14. [Directory Structure](#14-directory-structure)
15. [Tech Stack](#15-tech-stack)
16. [Analysis Pipeline Details](#16-analysis-pipeline-details)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Overview

Reflct is a desktop application built on Electron that pairs a clip-based video editor with an AI coaching engine. You bring the video — recorded on Zoom, OBS, a phone, a webcam, or pulled straight from YouTube — and Reflct tells you exactly what is working and what is not, and why.

The editing side is a full non-linear editor: import video files, arrange them on a multi-track timeline, trim and split with frame accuracy, control playback speed, and export a finished MP4. This is useful for cutting your recording down to the relevant section before running analysis, or for comparing clips side by side.

The analysis engine is what sets Reflct apart. Rather than sampling a handful of frames and writing a generic summary, it:

1. **Transcribes the full audio** using OpenAI Whisper — one call, all timestamps preserved.
2. **Divides the video into segments** automatically based on length, with 6–15 frames per segment and the matching transcript slice.
3. **Analyzes each segment** with a separate GPT-4o Vision call, producing 3–8 specific, timestamped observations per segment.
4. **Synthesizes everything** in a final text-only call that reads all observations and writes the summary and scores.

This means a 30-minute video gets the same per-minute attention as a 3-minute video — the AI sees every segment, not a sparse sample.

All AI calls use your own OpenAI API key (BYOK). Keys are stored locally in `~/.va-settings.json` and never embedded in project files.

### Who it's for

| Use case | What you record | What Reflct evaluates |
|---|---|---|
| **Job interview prep** | Mock interview on Zoom | Answer quality, confidence, structure, filler words |
| **Sales** | Client call recording | Persuasion, pacing, listening signals, closing technique |
| **Content creation** | Vlog, YouTube video | Engagement, camera presence, pacing, delivery |
| **Public speaking** | Practice presentation | Structure, energy, eye contact, vocal variety |
| **Teaching** | Lecture or tutorial | Clarity, pacing, engagement, explanation quality |
| **Performance review** | Any video of yourself | General communication, body language, professionalism |

Because you describe the context before each analysis, the AI evaluates the right things for the right situation — never one-size-fits-all.

---

## 2. Feature Set

### Video Editor

| Feature | Description |
|---|---|
| **Multi-track timeline** | Unlimited video tracks with independent clips per track |
| **Clip splitting** | Split all tracks simultaneously at the playhead with `S` |
| **Ripple delete** | Remove a clip and automatically slide all downstream clips left to close the gap |
| **Drag & drop** | Reposition clips horizontally or move them between tracks vertically |
| **Magnetic snapping** | Clips snap to other clips' edges, the playhead, and time zero |
| **Per-clip speed** | 0.25× to 4× speed per clip; baked in at export using FFmpeg filters |
| **Timeline zoom** | Ctrl+Scroll anchored to cursor position, or toolbar ± buttons |
| **Jump navigation** | `[` and `]` jump between all clip boundaries across all tracks |
| **Frame-accurate preview** | HTML5 `<video>` element synced to timeline playhead in real time |
| **Project management** | New / open / save / recent projects via startup screen |
| **Auto-save** | Project saved automatically 2 seconds after any change |

### YouTube Import

| Feature | Description |
|---|---|
| **Paste any YouTube URL** | Supports standard, Shorts, live recordings, and unlisted videos |
| **Quality selector** | Download at 720p, 1080p, or best available |
| **Auto clipboard paste** | Modal auto-fills if a YouTube URL is already in the clipboard |
| **Auto timeline insertion** | Downloaded video is imported, converted, and dropped onto the timeline automatically |
| **Progress streaming** | Live percentage and step log while downloading and converting |
| **yt-dlp backed** | Uses the most actively maintained YouTube downloader available |

### AI Analysis

| Feature | Description |
|---|---|
| **Context-aware** | You describe who is in the video, what they're doing, and what the video is about — analysis is tailored to that context |
| **Full-video coverage** | Video is split into segments; every segment gets its own GPT-4o Vision call |
| **Full audio transcription** | Whisper transcribes the complete audio with timestamps; each segment receives its matching transcript slice |
| **Timestamped observations** | 3–8 specific, clickable observations per segment, each tied to a visible moment or transcript line |
| **Four observation categories** | Went Right · Went Wrong · Improve · Work On |
| **Category filters** | Filter the timeline tab to show only one category at a time |
| **Seek on click** | Click any timestamp in the panel to jump the video to that exact moment |
| **Timeline markers** | Colored vertical lines drawn on the editor timeline at every observation timestamp |
| **Written summary** | 4–6 paragraph coaching narrative referencing specific moments |
| **Numerical scores** | 10 categories scored 0–10 with individual comments; full score bar visualization |
| **Holistic synthesis** | Final pass is text-only with all observations as input — scores and summary are never generated from a partial view |

### Analysis Scoring Categories

| Category | What is being evaluated |
|---|---|
| **Speech & Articulation** | Clarity of pronunciation, volume control, use of filler words |
| **Clarity of Message** | How well ideas are communicated and understood |
| **Confidence & Presence** | Perceived authority, steadiness, decisiveness |
| **Body Language** | Posture, gestures, stillness vs. fidgeting |
| **Content Quality** | Substance, accuracy, depth of what is said |
| **Structure & Flow** | Logical organization, transitions, narrative arc |
| **Engagement** | Energy, likeability, ability to hold attention |
| **Eye Contact** | Camera/interviewer gaze, avoidance patterns |
| **Pacing** | Speed of speech, pauses, rhythm |
| **Overall** | Holistic summary score accounting for all factors |

---

## 3. Setup & Running

### Requirements

| Dependency | Notes |
|---|---|
| **Node.js** | v18 or later |
| **FFmpeg** | Must be on PATH — install instructions below |
| **OpenAI API key** | Required for analysis (Whisper + GPT-4o). BYOK — your key, your account. |
| **yt-dlp** | Required for YouTube import only — editing and analysis work without it |

### 1. Install Node dependencies

```bash
cd VideoAnalyzer
npm install
```

### 2. Install FFmpeg

FFmpeg is used for all video import, frame extraction, audio extraction, and export.

```bash
# Windows
winget install Gyan.FFmpeg

# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg
```

Verify: `ffmpeg -version`

### 3. Install yt-dlp (for YouTube import)

```bash
# Any platform with pip
pip install yt-dlp

# Windows (WinGet)
winget install yt-dlp

# macOS
brew install yt-dlp
```

Verify: `yt-dlp --version`

> yt-dlp is detected automatically on startup. If it is not found, the YouTube import button is still visible but the Download button will be disabled with an installation message.

### 4. Run

```bash
npm start
```

The startup screen appears. Create a new project (choose a name and folder) or open a recent one to enter the editor.

### 5. Add your OpenAI API key

Click **⚙** in the toolbar → paste your OpenAI API key → Save.

The key is stored in `~/.va-settings.json`. It is used for:
- Whisper API (audio transcription)
- GPT-4o Vision (per-segment analysis)
- GPT-4o (synthesis call)

> **Cost estimate:** A 10-minute video runs ~4 segment passes + 1 synthesis = ~5 API calls. Total cost is typically $0.05–$0.15 depending on video length and chosen model.

---

## 4. App Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Toolbar: Project Name  |  + Import  ▶ YouTube  |  Split  Delete  Ripple Delete  │
│           + Track  |  Speed ▾  Apply  |  −  +  |  ▶ Analyze  |  Save  Export  ⚙ │
├───────────┬───────────────────────────────────────────┬──────────────────────────┤
│           │                                           │  Analysis ×              │
│  Media    │                                           │  ┌──────┬───────┬──────┐ │
│  ──────── │          Preview window                   │  │ Time │ Summ. │Score │ │
│  video.mp4│          (video playback)                 │  ├──────┴───────┴──────┤ │
│  4:12     │                                           │  │ All ✓ ✗ ↑ ⟳         │ │
│           ├───────────────────────────────────────────┤  │                      │ │
│           │  ⏮  ▶  ⏭     1:24.5 / 4:12.0  video.mp4  │  │ [0:42] ✓ Went Right  │ │
│           │                                           │  │ Strong opening...    │ │
│           │                                           │  │ [1:15] ✗ Went Wrong  │ │
│           │                                           │  │ Trailing off at...   │ │
│           │                                           │  │ [2:08] ↑ Improve     │ │
│           │                                           │  │ Pause before...      │ │
└───────────┴───────────────────────────────────────────┴──└──────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Video 1 │  ████████ Ruler ─────────────────────────────────────────────────────── │
│         │  [     clip A     ──────────────────────────────────────────────────]  │
│         │  ▲             ▲            ▲                       ▲                  │
│         │ green         red          orange                  blue (markers)      │
└─────────┴──────────────────────────────────────────────────────────────────────── ┘
```

**Left panel — Media:** All imported and downloaded video files. Click any item to append it to Video 1. Shows filename and duration. MKV badge appears for files that were converted on import.

**Center — Preview:** Live video playback synced to timeline position. The ⏮ / ▶ / ⏭ controls navigate between clip boundaries and play/pause. Time display shows current position and total duration.

**Right — Analysis Panel:** Appears after a successful analysis. Contains three tabs (see [The Analysis Panel](#9-the-analysis-panel)). Can be closed with × and re-opened after the next analysis run.

**Timeline:** Ruler + track area. Colored vertical marker lines appear at every observation timestamp after analysis runs. Green = went right, Red = went wrong, Orange = improve, Blue = work on.

---

## 5. Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `S` | Split all clips at playhead |
| `Del` | Delete selected clip |
| `Shift+Del` | Ripple delete (remove + shift everything left) |
| `[` | Jump to previous clip boundary |
| `]` | Jump to next clip boundary |
| `+` / `=` | Zoom timeline in |
| `-` | Zoom timeline out |
| `Ctrl+Scroll` | Zoom timeline anchored to cursor position |
| `Ctrl+S` | Save project |

---

## 6. Editing Guide

### Importing Local Files

Click **+ Import** to open a file picker. Supported formats: MP4, MOV, AVI, MKV, WebM, M4V, WMV, FLV. Each file is remuxed to an H.264 MKV working copy via FFmpeg — no re-encoding, no quality loss, just consistent container format for reliable seeking. The original source file is never modified. Working copies are saved to `project/working/`.

### Adding Clips to the Timeline

Click any item in the Media panel to append it at the end of Video 1. You can also drag it to reposition after adding.

### Splitting

Move the playhead to your desired cut point (click the ruler, drag, or use `[`/`]` to jump) and press `S` or click **Split**. All tracks are split simultaneously.

### Deleting

Click a clip to select it (orange border). Press `Del` to remove it, leaving a gap. Press `Shift+Del` (Ripple Delete) to remove it and automatically pull all downstream clips left to close the gap.

### Moving Clips

Drag clips horizontally to reposition, or vertically to move them to a different track. A yellow snap line appears when a clip edge is about to align with another clip, the playhead, or the start of the timeline. Release to snap.

### Speed Control

Select a clip, choose a multiplier from the Speed dropdown (0.25× to 4×), and click **Apply**. A speed badge appears on the clip. Speed changes are non-destructive and applied at export time using FFmpeg's `setpts` (video) and chained `atempo` (audio) filters.

### Multiple Tracks

Click **+ Track** to add another video track. Only **Video 1** is used for playback preview and export — additional tracks are useful for visual reference or alternate takes while deciding what to analyze.

### Timeline Zoom

Use `+`/`-`, the toolbar buttons, or hold `Ctrl` and scroll over the timeline or ruler. Ctrl+Scroll zooms anchored to the time position under the cursor, keeping your work centred in view.

---

## 7. YouTube Import

Click **▶ YouTube** in the toolbar to open the YouTube import panel.

### How it works

1. Paste any YouTube URL — or let the app auto-paste from your clipboard if it already contains one.
2. Choose a quality (720p recommended for analysis; 1080p for detailed review; Best for maximum quality).
3. Click **⬇ Download**.
4. yt-dlp downloads the video with the best available format matching your quality choice.
5. The downloaded file is automatically converted to an MKV working copy (same as local import).
6. The video is added to the Media panel and dropped onto the timeline — ready to play and analyze.

### Supported URL formats

| Format | Example |
|---|---|
| Standard watch URL | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` |
| Short URL | `https://youtu.be/dQw4w9WgXcQ` |
| YouTube Shorts | `https://www.youtube.com/shorts/VIDEO_ID` |
| Live recording | `https://www.youtube.com/live/VIDEO_ID` |
| Unlisted video | Any of the above with a private hash |

Playlists are not supported — the `--no-playlist` flag ensures only the single video is downloaded even if the URL is part of a playlist.

### yt-dlp not installed

If yt-dlp is not found on startup, the Download button is disabled and a banner shows the install commands. Install yt-dlp and restart the app — detection runs at launch.

### Quality guide

| Setting | Typical file size (10 min) | Best for |
|---|---|---|
| 720p | ~150–300 MB | Analysis — sufficient detail, faster download |
| 1080p | ~300–700 MB | Detailed review where visual quality matters |
| Best | Varies | When you want the original source quality |

---

## 8. Video Analysis

### Before you run analysis

Trim your video to the relevant section if needed (split, delete, ripple delete), then make sure the video is on **Video 1** of the timeline. Analysis always uses the first clip on Video 1 as its input. For longer recordings, you may want to remove dead air at the start and end first.

### Running an analysis

1. Click **▶ Analyze** in the toolbar.
2. Fill in the three context fields:

| Field | What to write | Example |
|---|---|---|
| **Who are you in the video?** | Your name and how you appear | "Mohammed Uruj, the person in the small PiP window on the call" |
| **What are you doing?** | The activity being performed | "Giving a job interview for a software engineering role" |
| **What is the video about?** | Additional context for the AI | "A recording of a mock interview I did with a friend. The interviewer is on the main screen, I'm in the corner." |

3. Choose the AI model (GPT-4o for best results; GPT-4o mini for faster, cheaper runs).
4. Click **Analyze →**.

### Why the context fields matter

The AI uses your answers to calibrate every part of its evaluation:

- A **vlogger** filming a day-in-the-life should not be docked for not looking at the camera during outdoor shots.
- A **job interviewee** should be — sustained eye contact with the interviewer is a core evaluation criterion.
- A **sales rep** is judged on persuasion and rapport-building; a **teacher** is judged on clarity and pacing.
- A **standup comedian** reviewing a set should be scored on timing and crowd energy; an **academic presenter** on structure and evidence quality.

Without this context, the AI would apply generic criteria that may not apply to your specific situation.

### What happens during analysis

The progress overlay streams every step in real time:

```
Probing video…
Transcribing audio with Whisper…  →  Transcript ready — 84 segments
Splitting into 6 segments · 12 frames each
Analyzing segment 1/6  (0:00 – 3:00)…  →  Segment 1 done — 5 observations
Analyzing segment 2/6  (3:00 – 6:00)…  →  Segment 2 done — 6 observations
Analyzing segment 3/6  (6:00 – 9:00)…  →  Segment 3 done — 4 observations
Analyzing segment 4/6  (9:00 – 12:00)… →  Segment 4 done — 7 observations
Analyzing segment 5/6  (12:00 – 15:00)…→  Segment 5 done — 5 observations
Analyzing segment 6/6  (15:00 – 17:43)…→  Segment 6 done — 4 observations
Synthesizing 31 observations into summary & scores…
```

When it finishes, the Analysis Panel opens on the right.

### Segment sizing

The engine automatically chooses segment length and frame density based on video duration:

| Video length | Segment duration | Frames / segment | Approx. frame interval |
|---|---|---|---|
| < 3 minutes | Full video | 15 | ~1 frame / 12s |
| 3–10 minutes | 2 minutes | 12 | ~1 frame / 10s |
| 10–30 minutes | 3 minutes | 12 | ~1 frame / 15s |
| 30–60 minutes | 4 minutes | 10 | ~1 frame / 24s |
| > 60 minutes | 6 minutes | 8 | ~1 frame / 45s |

Maximum of 15 segments regardless of length. For videos longer than 90 minutes, segment duration is auto-scaled to stay within that cap.

### Estimated time and cost

| Video length | Approx. time | Approx. cost (GPT-4o) |
|---|---|---|
| < 3 min | 1–2 min | ~$0.03–0.06 |
| 10 min | 3–5 min | ~$0.08–0.15 |
| 30 min | 8–14 min | ~$0.20–0.40 |
| 60 min | 15–25 min | ~$0.35–0.70 |

Times depend on OpenAI response latency. GPT-4o mini is ~60% cheaper with slightly less detailed observations.

---

## 9. The Analysis Panel

The panel appears on the right side of the screen after a successful analysis. It has three tabs.

### Tab 1 — Timeline

A scrollable list of every timestamped observation from across the full video, sorted chronologically.

**Click any item to seek the video to that exact moment.** The playhead jumps there and the preview updates instantly — making it easy to watch the moment the AI is describing.

**Categories:**

| Badge | Colour | Meaning |
|---|---|---|
| ✓ Went Right | Green | A notable strength — something done well worth repeating |
| ✗ Went Wrong | Red | A clear mistake, nervous habit, or weak delivery moment |
| ↑ Improve | Orange | A decent moment that had a specific, actionable way to be better |
| ⟳ Work On | Blue | A recurring pattern or skill gap (references a representative moment) |

**Filter bar:** Click any category button at the top to show only that category. Click **All** to see everything.

**Timeline markers:** Every observation also draws a colored vertical line on the editor timeline at its timestamp. Green, red, orange, and blue lines correspond to the four categories. Hovering over a marker shows the observation text in a tooltip.

### Tab 2 — Summary

A 4–6 paragraph written coaching assessment. References specific timestamps. Describes patterns, not just isolated moments. Closes with a prioritized recommendation for what to work on first.

The summary is generated from the complete observation log — not from a partial sample — so it reflects the full arc of the recording.

Text in this tab is selectable and can be copied.

### Tab 3 — Scores

Ten scored categories, each with:
- A numeric score (0.0–10.0)
- A colour-coded progress bar (green = 7.5+, orange = 5–7.4, red = below 5)
- A 1–2 sentence comment referencing actual observed moments

At the top, a large **Overall score badge** provides the holistic headline number.

Scoring is calibrated to the activity you described. A score of 5 is average for someone doing that activity. 7 is solid. 9+ is exceptional.

---

## 10. Settings

Click **⚙** in the toolbar.

| Setting | Description |
|---|---|
| **OpenAI API Key** | Required for analysis. Used for Whisper (transcription) and GPT-4o (vision + synthesis). Stored in `~/.va-settings.json`. Never embedded in project files. |

Keys are injected into API calls at runtime and never logged or stored anywhere except the local settings file.

---

## 11. Export

Click **Export MP4** in the toolbar and choose a save location.

The export pipeline:

1. Collects all clips on **Video 1** sorted by timeline position.
2. For each clip: trims to `sourceStart + sourceDuration`, applies per-clip speed (`setpts` for video, chained `atempo` for audio), and encodes to H.264 CRF 18 + AAC 192k.
3. Normalises all segments to the same resolution (from the first clip's dimensions).
4. Concatenates all segments using FFmpeg's filter_complex concat, then encodes to a final MP4 with `movflags +faststart` for streaming compatibility.

Only **Video 1** is exported. Additional tracks are ignored.

---

## 12. Project Files

Projects are saved as `.vap` files (plain JSON). Each project lives in its own folder:

```
MyProject/
├── MyProject.vap        ← project state (tracks, clips, zoom, playhead)
└── working/
    ├── id3.mkv          ← MKV working copies of imported source files
    ├── yt_1718291234.mkv← MKV working copy of a YouTube download
    └── id7.mkv
```

Working copies are FFmpeg remuxes (stream copy for local files; H.264 transcode for YouTube downloads to normalize container). Source files are never modified. If you move or delete a source file after importing, re-import from the original location.

Recent projects (up to 10) are tracked in `~/.va-recent.json` and listed on the startup screen.

---

## 13. Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                     Electron Main Process  (main.js)                   │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐ │
│  │ Project / File   │  │  FFmpeg pipeline  │  │  Settings             │ │
│  │ ipcMain handlers │  │  import / export  │  │  ~/.va-settings.json  │ │
│  └────────┬─────────┘  └────────┬──────────┘  └──────────┬────────────┘ │
│           │                    │                         │              │
│  ┌────────▼────────────────────▼─────────────────────────▼──────────┐  │
│  │                    Analysis Engine (Node.js)                     │  │
│  │                                                                  │  │
│  │  probeVideoDuration()       — ffprobe via execFile               │  │
│  │  extractAudioFFmpeg()       — ffmpeg audio strip                 │  │
│  │  whisperTranscribe()        — OpenAI Whisper API (https)         │  │
│  │  planSegments()             — dynamic segment sizing             │  │
│  │  extractFramesForSegment()  — ffmpeg -ss -t fps filter           │  │
│  │  analyzeSegment()           — GPT-4o Vision (frames + transcript)│  │
│  │  synthesizeResults()        — GPT-4o text-only synthesis         │  │
│  │  callGPT4oRaw()             — low-level https POST               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                   yt-dlp subprocess (spawn)                    │    │
│  │  stdout lines → parsed for % progress + output file path       │    │
│  │  metadata pre-flight: --print %(id)s|||%(title)s               │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  ipcMain.handle() / webContents.send()                                 │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ contextBridge  (preload.js)
┌──────────────────────────────▼─────────────────────────────────────────┐
│                        Renderer Process                                 │
│   renderer/index.html + editor.js + editor.css                         │
│                                                                        │
│   Project state → render() → DOM timeline + Canvas ruler               │
│   Playback: requestAnimationFrame loop + <video> element sync          │
│   Analysis panel: 3-tab right panel with clickable timestamps          │
│   Modals: new-project, analyze-context, youtube-import, settings       │
└────────────────────────────────────────────────────────────────────────┘
```

**IPC communication pattern:**

- `ipcMain.handle()` — request/response for all operations (project, import, export, analysis, YouTube download, settings)
- `webContents.send()` — one-way progress events streamed to the renderer during long operations (analysis segment updates, YouTube download %, export progress)
- `contextBridge` — all `window.api.*` methods declared in `preload.js` with context isolation; the renderer has no Node.js access

**Analysis API calls:**

All OpenAI calls are made directly from the main process using Node.js's built-in `https` module — no external HTTP libraries required. Multipart form-data for the Whisper upload is built manually using `Buffer.concat`. JSON bodies are sent with `Content-Length` set explicitly.

---

## 14. Directory Structure

```text
VideoAnalyzer/
├── main.js               ← Electron main: IPC handlers, FFmpeg, analysis engine, yt-dlp
├── preload.js            ← contextBridge API surface exposed to the renderer
├── package.json          ← dependencies: electron, ffmpeg-static
├── README.md
└── renderer/
    ├── index.html        ← full UI: startup screen, editor, analysis panel, all modals
    ├── editor.js         ← all client-side state, rendering, playback, event handling
    └── editor.css        ← dark theme styles, timeline, analysis panel, score cards
```

Runtime files created automatically:

```text
~/.va-settings.json       ← OpenAI API key (user home, never in project)
~/.va-recent.json         ← paths of recently opened projects (up to 10)

<project-folder>/
├── <name>.vap            ← project state (JSON)
└── working/
    └── <mediaId>.mkv     ← FFmpeg working copies of imported videos
```

---

## 15. Tech Stack

| Layer | Technology |
|---|---|
| **Desktop shell** | Electron 31 (main + renderer, contextIsolation enabled) |
| **UI** | Vanilla JS + HTML5 Canvas (ruler) — no framework |
| **Video processing** | FFmpeg (import remux, segment frame extraction, audio strip, export encode) |
| **Transcription** | OpenAI Whisper API (`whisper-1`, verbose_json with segment timestamps) |
| **Vision analysis** | OpenAI GPT-4o (per-segment) with base64-encoded JPEG frames at `detail: low` |
| **Synthesis** | OpenAI GPT-4o (text-only final pass) |
| **YouTube download** | yt-dlp (external binary, spawned as subprocess) |
| **HTTP client** | Node.js built-in `https` module — no axios/node-fetch |
| **Storage** | `.vap` project files (JSON), `~/.va-*.json` for settings/recents |

---

## 16. Analysis Pipeline Details

### Full flow, step by step

```
Video file (local or downloaded from YouTube)
      │
      ▼
[1]  ffprobe → duration in seconds

[2]  ffmpeg → audio.mp3 (16kHz mono)
      │
      ▼
      OpenAI Whisper API (whisper-1, verbose_json)
      → [{start, end, text}, ...] with per-segment timestamps
      → stored in memory for reuse across all segment calls

[3]  planSegments(duration)
      → segmentDuration, framesPerSegment
      → numSegments = ceil(duration / segmentDuration)

[4]  for each segment i:
        segStart = i * segmentDuration
        segEnd   = min(segStart + segmentDuration, duration)

        ffmpeg -ss segStart -t (segEnd-segStart) -vf fps=1/interval,scale=640:-2
          → frame_%04d.jpg  (6–15 frames)

        transcriptSlice = whisperSegments.filter(segStart ≤ s.start < segEnd)
          → formatted as "[m:ss] text" lines

        GPT-4o Vision call:
          content = [
            { type: "text",      text: segmentPrompt },
            { type: "text",      text: "Frame at m:ss" },
            { type: "image_url", url:  "data:image/jpeg;base64,..." },
            ... (one text label + one image per frame)
          ]
          max_tokens: 1500
          → { observations: [{time, category, note}, ...] }

        observations validated: time must be within [segStart-2, segEnd+2]

[5]  allObservations = concat of all segment observations (sorted by time)

[6]  GPT-4o text-only synthesis call:
        input: full observation log + transcript sample (trimmed to 150 lines)
        max_tokens: 3000
        → { summary: "...", scores: { speech: {score, comment}, ... } }

[7]  Return { success, timestamps: allObservations, summary, scores }
```

### Transcript reuse

Whisper is called exactly once for the full audio. The resulting `[{start, end, text}]` array is filtered in memory for each segment call — no additional Whisper calls, no per-segment audio extraction.

### Frame encoding

Frames are extracted at 640px wide (height auto-scaled to maintain aspect ratio) and encoded as JPEG quality 5 (good enough for GPT-4o's `detail: low` mode, which downsizes images to 512×512 internally anyway). Each frame is base64-encoded and embedded inline in the API request.

### Token budget per segment call

| Component | Approx. tokens |
|---|---|
| System/context prompt | ~350 |
| Transcript slice (avg) | ~200 |
| 12 frames × 85 tokens (`detail: low`) | ~1020 |
| **Total input** | **~1570** |
| Max output | 1500 |

Well within GPT-4o's 128k context window. No truncation risk.

### Synthesis call token budget

| Component | Approx. tokens |
|---|---|
| Context prompt + scoring instructions | ~400 |
| Observation log (30 obs × ~20 tokens) | ~600 |
| Transcript sample (150 lines × ~15 tokens) | ~2250 |
| **Total input** | **~3250** |
| Max output | 3000 |

The synthesis call carries no images — it's pure text reasoning over the full observation log.

---

## 17. Troubleshooting

**App won't start**

Run `npm start` from the `VideoAnalyzer/` folder and check the terminal for errors. Ensure `npm install` completed without errors and that Node.js v18+ is installed.

**FFmpeg not found**

```bash
# Windows
winget install Gyan.FFmpeg

# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg
```

After installing, verify with `ffmpeg -version`. Restart Reflct — FFmpeg is detected at startup.

**yt-dlp not found / YouTube Download button is greyed out**

```bash
pip install yt-dlp        # any platform
winget install yt-dlp     # Windows
brew install yt-dlp       # macOS
```

Restart the app after installing. Detection runs at launch. If yt-dlp is installed but still not found, try running `yt-dlp --version` in a terminal to confirm it is on your PATH.

**YouTube download fails**

- Make sure the URL is a valid YouTube video URL (not a playlist root or channel page)
- Some videos are age-gated or region-restricted — yt-dlp cannot download these without cookies
- Try updating yt-dlp: `pip install -U yt-dlp` — YouTube changes frequently and old versions break

**Analysis fails with "OpenAI API key required"**

Click **⚙** in the toolbar and paste your OpenAI API key. The key must have access to:
- `whisper-1` model (for audio transcription)
- `gpt-4o` or `gpt-4o-mini` (for vision and synthesis)

Check that your account has credits at [platform.openai.com/usage](https://platform.openai.com/usage).

**Analysis fails mid-way (one segment errors, others succeed)**

Single-segment failures are non-fatal — the engine continues with remaining segments and synthesizes from whatever observations were collected. You will see a warning line like `Segment 3 warning: ...` in the progress log. If the failure repeats, check your OpenAI account for rate limits or quota errors.

**Analysis returns very few timestamps / shallow observations**

- Make the context fields more specific. "I am giving an interview" is less useful than "I am Mohammed, the small PiP window on a Zoom call, answering behavioral questions for a FAANG software engineering interview."
- If the video has no audio (screen recording without microphone, muted video), Whisper will return an empty transcript. The engine falls back to visual-only analysis, which is less detailed for speech-heavy content.
- Try GPT-4o instead of GPT-4o mini for noticeably more specific observations.

**Analysis progress bar seems stuck**

The bar is updated per segment. For a long video with many segments, each bar update may take 30–60 seconds as the API call completes. Check the status text below the bar — if it is still showing a segment number, the call is in progress. If it shows "Synthesizing…", the final pass is running, which can take 20–30 seconds.

**"GPT-4o parse failed" error**

This means GPT-4o returned something that wasn't valid JSON. This usually happens if:
- The response was cut off due to a server-side issue — retry the analysis
- The context fields contained special characters that confused the prompt — simplify the text

**Exported video has wrong speed**

Speed is applied per-clip at export time using `setpts` (video) and chained `atempo` (audio). FFmpeg version 4.x+ supports chained `atempo` for speeds above 2× or below 0.5×. Install a recent FFmpeg build and verify with `ffmpeg -version`.

**Import fails for certain video files**

Reflct attempts to remux the source file to MKV via FFmpeg stream copy first. If that fails (corrupted container, unsupported codec), it falls back to using the original source file directly. If playback is choppy or stuttering, try re-encoding the source with Handbrake before importing.

**Analysis panel doesn't show after analysis completes**

If the analysis returned `success: false`, check the alert message for the error. If `success: true` was returned but the panel is missing, reload the app (`Ctrl+R` in dev mode). This is a rare render-path edge case that will be fixed in a future version.

**High API costs**

Use **GPT-4o mini** in the model dropdown for faster, cheaper analysis. Mini is ~60% cheaper and produces slightly less detailed observations, but the summary and scores are still accurate. For rough drafts, this is usually sufficient. Switch to GPT-4o for final or important reviews.
