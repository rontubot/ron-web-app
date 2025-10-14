// preload.js    
const { contextBridge, ipcRenderer } = require('electron');    
    
contextBridge.exposeInMainWorld('electronAPI', {    
  // ====== Auth / Config hacia proceso main ======    
  setAuthToken: (token) => ipcRenderer.invoke('auth:set-token', token ?? null),    
  setApiBase:   (url)   => ipcRenderer.invoke('auth:set-api-base', url ?? ''),    
    
  // ====== Proxy HTTP genérico (alias y compat) ======    
  // Preferido por nuestros servicios    
  request:   (opts) => ipcRenderer.invoke('ron:req', opts),    
  // Compat con código antiguo que veía 'ronRequest'    
  ronRequest: (opts) => ipcRenderer.invoke('ron:req', opts),    
    
  // ====== Chat directo (usa el token guardado en main) ======    
  askRon: (payload = {}) => {    
    // Opcionalmente podés pasar { text, username }, el token NO hace falta pasarlo aquí:    
    // el proceso main ya lo guarda con setAuthToken.    
    const { text, username } = payload || {};    
    return ipcRenderer.invoke('ask-ron', { text, username });    
  },    
    
  // NUEVO: Chat con streaming  
  askRonStream: (payload = {}) => {  
    const { text, username } = payload || {};  
    return ipcRenderer.invoke('ask-ron-stream', { text, username });  
  },  
    
  // ====== 24/7 ======    
  startRon247: (payload = {}) => ipcRenderer.invoke('start-ron-247', payload),    
  stopRon247:  () => ipcRenderer.invoke('stop-ron-247'),    
  getRon247Status: (payload = {}) => ipcRenderer.invoke('get-ron-247-status', payload),    
  toggleRon247Listening: (payload = {}) => ipcRenderer.invoke('toggle-ron-247-listening', payload),    
    
  // ====== Grabación manual ======    
  startManualRecording: () => ipcRenderer.invoke('start-manual-recording'),    
  stopManualRecording:  () => ipcRenderer.invoke('stop-manual-recording'),    
    
  // ====== Eventos (con unsubscribe limpio) ======    
  onRon247StatusChange: (callback) => {    
    if (typeof callback !== 'function') return () => {};    
    const handler = (_e, status) => callback(status);    
    ipcRenderer.on('ron-247-status-changed', handler);    
    return () => ipcRenderer.removeListener('ron-247-status-changed', handler);    
  },    
    
  onRon247Output: (callback) => {    
    if (typeof callback !== 'function') return () => {};    
    const handler = (_e, output) => callback(output);    
    ipcRenderer.on('ron-247-output', handler);    
    return () => ipcRenderer.removeListener('ron-247-output', handler);    
  },    
    
  // NUEVO: Listener para progreso de descarga/instalación    
  onDownloadProgress: (callback) => {    
    if (typeof callback !== 'function') return () => {};    
    const handler = (_e, progress) => callback(progress);    
    ipcRenderer.on('download-progress', handler);    
    return () => ipcRenderer.removeListener('download-progress', handler);    
  },    
    
  // NUEVO: Listeners para streaming de respuestas  
  onStreamChunk: (callback) => {  
    if (typeof callback !== 'function') return () => {};  
    const handler = (_e, chunk) => callback(chunk);  
    ipcRenderer.on('stream-chunk', handler);  
    return () => ipcRenderer.removeListener('stream-chunk', handler);  
  },  
    
  onStreamDone: (callback) => {  
    if (typeof callback !== 'function') return () => {};  
    const handler = (_e) => callback();  
    ipcRenderer.on('stream-done', handler);  
    return () => ipcRenderer.removeListener('stream-done', handler);  
  },  
    
  onStreamError: (callback) => {  
    if (typeof callback !== 'function') return () => {};  
    const handler = (_e, error) => callback(error);  
    ipcRenderer.on('stream-error', handler);  
    return () => ipcRenderer.removeListener('stream-error', handler);  
  },  
    
  // ====== Limpieza manual opcional ======    
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),    
});