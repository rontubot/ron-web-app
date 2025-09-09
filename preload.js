const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  startRon247: (userData) => ipcRenderer.invoke('start-ron-247', userData),
  stopRon247: () => ipcRenderer.invoke('stop-ron-247'),
  getRon247Status: () => ipcRenderer.invoke('get-ron-247-status'),
  toggleRon247Listening: () => ipcRenderer.invoke('toggle-ron-247-listening'),
  startManualRecording: () => ipcRenderer.invoke('start-manual-recording'),  
  stopManualRecording: () => ipcRenderer.invoke('stop-manual-recording'),


  onRon247StatusChange: (callback) => {
    ipcRenderer.on('ron-247-status-changed', callback);
  },
  onRon247Output: (callback) => {
    ipcRenderer.on('ron-247-output', callback);
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },


  ronRequest: (opts) => ipcRenderer.invoke('ron:req', opts),
});