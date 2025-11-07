// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ====== TAREAS EN SEGUNDO PLANO ======
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  getTask: (id) => ipcRenderer.invoke('tasks:get', id),

  // limpiar tareas completadas
  clearCompletedTasks: () => ipcRenderer.invoke('tasks:clear-completed'),

  // borrar una tarea concreta
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),

  // cancelar una tarea en curso (con confirmación en el front)
  cancelTask: (id) => ipcRenderer.invoke('tasks:cancel', id),

  // suscripción a cambios de tareas (lista completa / actualizaciones)
  onTaskUpdated: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('tasks:updated', handler);
    return () => ipcRenderer.removeListener('tasks:updated', handler);
  },

  // 🔹 NUEVO: mensaje cuando una tarea de fondo termina con éxito
  onTaskCompletedMessage: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_e, data) => cb(data); // { id, action, summary }
    ipcRenderer.on('task-completed-message', handler);
    return () => ipcRenderer.removeListener('task-completed-message', handler);
  },

  // ====== Auth / Config hacia proceso main ======
  setAuthToken: (token) => ipcRenderer.invoke('auth:set-token', token ?? null),
  setApiBase:   (url)   => ipcRenderer.invoke('auth:set-api-base', url ?? ''),

  // ====== Proxy HTTP genérico (alias y compat) ======
  request:   (opts) => ipcRenderer.invoke('ron:req', opts),
  ronRequest: (opts) => ipcRenderer.invoke('ron:req', opts),

  // ====== Chat directo (usa el token guardado en main) ======
  askRon: (payload = {}) => {
    const { text, username } = payload || {};
    return ipcRenderer.invoke('ask-ron', { text, username });
  },

  // ====== Chat con streaming ======
  askRonStream: (payload = {}) => {
    const { text, username } = payload || {};
    return ipcRenderer.invoke('ask-ron-stream', { text, username });
  },

  // ====== 24/7 ======
  startRon247:       (payload = {}) => ipcRenderer.invoke('start-ron-247', payload),
  stopRon247:        ()             => ipcRenderer.invoke('stop-ron-247'),
  getRon247Status:   (payload = {}) => ipcRenderer.invoke('get-ron-247-status', payload),
  toggleRon247Listening: (payload = {}) =>
    ipcRenderer.invoke('toggle-ron-247-listening', payload),

  // ====== Grabación manual ======
  startManualRecording: () => ipcRenderer.invoke('start-manual-recording'),
  stopManualRecording:  () => ipcRenderer.invoke('stop-manual-recording'),

  // ====== Eventos Ron 24/7 ======
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

  // ====== Progreso de descarga/instalación Python ======
  onDownloadProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_e, progress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  // ====== Streaming de respuestas ======
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

  // (opcional) resultados de comandos síncronos
  onCommandResults: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_e, results) => callback(results);
    ipcRenderer.on('command-results', handler);
    return () => ipcRenderer.removeListener('command-results', handler);
  },

  // ====== Limpieza manual opcional ======
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
