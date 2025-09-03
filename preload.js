const { contextBridge, ipcRenderer } = require('electron');    
    
contextBridge.exposeInMainWorld('electronAPI', {    
  // Funciones para Ron 24/7 (EXISTENTES)  
  startRon247: (userData) => ipcRenderer.invoke('start-ron-247', userData),    
  stopRon247: () => ipcRenderer.invoke('stop-ron-247'),    
  getRon247Status: () => ipcRenderer.invoke('get-ron-247-status'),    
    
  // NUEVA: Función para activar/desactivar listening  
  toggleRon247Listening: () => ipcRenderer.invoke('toggle-ron-247-listening'),  
      
  // Listeners para eventos (EXISTENTES)  
  onRon247StatusChange: (callback) => {    
    ipcRenderer.on('ron-247-status-changed', callback);    
  },    
  onRon247Output: (callback) => {    
    ipcRenderer.on('ron-247-output', callback);    
  },    
      
  // Cleanup listeners (EXISTENTE)  
  removeAllListeners: (channel) => {    
    ipcRenderer.removeAllListeners(channel);    
  }    
});