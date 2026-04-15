const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Project
  getRecentProjects:     ()  => ipcRenderer.invoke('get-recent-projects'),
  pickProjectFolder:     ()  => ipcRenderer.invoke('pick-project-folder'),
  pickProjectFile:       ()  => ipcRenderer.invoke('pick-project-file'),
  createProject:         (d) => ipcRenderer.invoke('create-project', d),
  openProject:           (f) => ipcRenderer.invoke('open-project', f),
  saveProject:           (d) => ipcRenderer.invoke('save-project', d),
  getActiveProject:      ()  => ipcRenderer.invoke('get-active-project'),

  // Media
  openFiles:             ()  => ipcRenderer.invoke('open-files'),
  importToMkv:           (d) => ipcRenderer.invoke('import-to-mkv', d),

  // Export
  saveFile:              (n) => ipcRenderer.invoke('save-file', n),
  exportVideo:           (d) => ipcRenderer.invoke('export-video', d),
  onExportProgress:      (cb) => ipcRenderer.on('export-progress', (_, d) => cb(d)),

  // YouTube import
  getYtDlpStatus:        ()  => ipcRenderer.invoke('get-yt-dlp-status'),
  importYoutube:         (d) => ipcRenderer.invoke('import-youtube', d),
  onYoutubeProgress:     (cb) => ipcRenderer.on('youtube-progress', (_, d) => cb(d)),

  // Analysis
  analyzeVideo:          (d) => ipcRenderer.invoke('analyze-video', d),
  onAnalyzeProgress:     (cb) => ipcRenderer.on('analyze-video-progress', (_, d) => cb(d)),

  // Settings
  getSettings:           ()  => ipcRenderer.invoke('get-settings'),
  saveSettings:          (d) => ipcRenderer.invoke('save-settings', d),
})
