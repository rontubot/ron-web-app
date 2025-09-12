const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ——— Acciones 24/7 ———
  startRon247: (userData) => ipcRenderer.invoke('start-ron-247', userData),
  stopRon247: () => ipcRenderer.invoke('stop-ron-247'),
  getRon247Status: () => ipcRenderer.invoke('get-ron-247-status'),
  toggleRon247Listening: () => ipcRenderer.invoke('toggle-ron-247-listening'),

  // ——— Grabación manual ———
  startManualRecording: () => ipcRenderer.invoke('start-manual-recording'),
  stopManualRecording: () => ipcRenderer.invoke('stop-manual-recording'),

  // ——— Preguntar a Ron (socket si está activo, fallback si no) ———
  askRon: (payload = {}) => {
    const { text, username } = payload || {};
    return ipcRenderer.invoke('ask-ron', { text, username });
  },

  // ——— Eventos con unsubscribe limpio y solo “data” ———
  onRon247StatusChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('ron-247-status-changed', handler);
    // devolver función para desuscribirse
    return () => ipcRenderer.removeListener('ron-247-status-changed', handler);
  },

  onRon247Output: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, output) => callback(output);
    ipcRenderer.on('ron-247-output', handler);
    // devolver función para desuscribirse
    return () => ipcRenderer.removeListener('ron-247-output', handler);
  },

  // ——— Remoción manual si lo necesitas ———
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // ——— Proxy HTTP opcional ———
  ronRequest: (opts) => ipcRenderer.invoke('ron:req', opts),
});