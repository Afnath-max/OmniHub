const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omni', {
  // Control
  start: () => ipcRenderer.invoke('omni-start'),
  stop: () => ipcRenderer.invoke('omni-stop'),
  restart: () => ipcRenderer.invoke('omni-restart'),
  status: () => ipcRenderer.invoke('omni-status'),
  
  // Models
  models: () => ipcRenderer.invoke('omni-models'),
  
  // Config
  getConfig: () => ipcRenderer.invoke('config-get'),
  setConfig: (key, value) => ipcRenderer.invoke('config-set', key, value),
  
  // Dashboard
  openDashboard: () => ipcRenderer.invoke('open-dashboard'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  
  // Logs
  getLogs: () => ipcRenderer.invoke('logs-get'),
  clearLogs: () => ipcRenderer.invoke('logs-clear'),
  
  // Event listeners
  onLog: (callback) => ipcRenderer.on('omni-log', (event, data) => callback(data)),
  onStarted: (callback) => ipcRenderer.on('omni-started', () => callback()),
  onStopped: (callback) => ipcRenderer.on('omni-stopped', (event, data) => callback(data))
});
