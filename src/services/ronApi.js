import { API_URL } from '../config';

const isElectron = !!window?.ron?.request;

async function http(path, { method = 'GET', headers = {}, body } = {}) {
  if (isElectron) {
    return await window.ron.request({ path, method, headers, body });
  }
  // Dev web: usa fetch normal con CORS
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { text }; }
  return { ok: res.ok, status: res.status, data };
}

// Ejemplos de endpoints (ajústalos a los tuyos reales):
export const ronApi = {
  health: () => http('/health'),
  connect247: (payload) => http('/ron247/connect', { method: 'POST', body: payload }),
  startListening: () => http('/ron247/listen', { method: 'POST' }),
  stopListening: () => http('/ron247/stop', { method: 'POST' }),
};