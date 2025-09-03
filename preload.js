const { contextBridge, ipcRenderer } = require('electron');  
  
contextBridge.exposeInMainWorld('electronAPI', {  
  // Funciones para Ron 24/7  
  startRon247: (userData) => ipcRenderer.invoke('start-ron-247', userData),  
  stopRon247: () => ipcRenderer.invoke('stop-ron-247'),  
  getRon247Status: () => ipcRenderer.invoke('get-ron-247-status'),  
    
  // Listeners para eventos  
  onRon247StatusChange: (callback) => {  
    ipcRenderer.on('ron-247-status-changed', callback);  
  },  
  onRon247Output: (callback) => {  
    ipcRenderer.on('ron-247-output', callback);  
  },  
    
  // Cleanup listeners  
  removeAllListeners: (channel) => {  
    ipcRenderer.removeAllListeners(channel);  
  }  
});