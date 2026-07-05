const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('omni', {
  start: () => ipcRenderer.invoke('omni-start'),
  stop: () => ipcRenderer.invoke('omni-stop'),
  status: () => ipcRenderer.invoke('omni-status'),
  onLog: (callback) => ipcRenderer.on('omni-log', (event, data) => callback(data)),
  onStatus: (callback) => ipcRenderer.on('omni-status', (event, data) => callback(data))
});
