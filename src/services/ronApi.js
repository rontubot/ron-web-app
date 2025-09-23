// src/services/ronApi.js
import { API_URL } from '../config';

// Detecta si estamos en Electron (preload expone electronAPI.request o tu shim)
const electronRequest =
  window?.electronAPI?.request ||
  window?.ron?.request ||
  null;

// Helper HTTP con token opcional, normaliza respuesta en web y electron
async function http(path, { method = 'GET', headers = {}, body, token } = {}) {
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  // ----- Electron -----
  if (electronRequest) {
    const res = await electronRequest({
      path,
      method,
      headers: mergedHeaders,
      body, // en electron dejá el objeto; el preload decide serializar
    });

    const ok = typeof res?.ok === 'boolean' ? res.ok : true;
    const status = typeof res?.status === 'number' ? res.status : 200;
    const data = res?.data ?? res;

    if (!ok) {
      const msg = data?.detail || data?.message || 'Error en la petición';
      throw new Error(`${status} ${msg}`);
    }
    return data;
  }

  // ----- Web -----
  const resp = await fetch(`${API_URL}${path}`, {
    method,
    headers: mergedHeaders,
    body: typeof body === 'undefined' ? undefined : JSON.stringify(body),
  });

  const rawText = await resp.text();
  let data;
  try { data = JSON.parse(rawText); } catch { data = { text: rawText }; }

  if (!resp.ok) {
    const msg = data?.detail || data?.message || 'Error en la petición';
    throw new Error(`${resp.status} ${msg}`);
  }
  return data;
}

export const ronApi = {
  // Estado actual del servicio 24/7
  async status247(token) {
    // Espera { status: 'inactive'|'listening'|'conversing'|'active', ... }
    return http('/ron247/status', { method: 'GET', token });
  },

  // Arranca el servicio 24/7
  async start247(token) {
    // Si tu backend requiere username, pásalo en body aquí.
    return http('/ron247/start', { method: 'POST', token });
  },

  // Detiene el servicio 24/7
  async stop247(token) {
    return http('/ron247/stop', { method: 'POST', token });
  },

  // Alterna solo la escucha (pausa/reanuda mic sin bajar el proceso)
  async toggle247Listening(token) {
    // Si tu backend no tiene este endpoint, podés mapear a /listen o /stop según estado.
    return http('/ron247/toggle-listen', { method: 'POST', token });
  },

  // Mantengo helpers por compat si ya los usabas:
  async startListening(token) {
    return http('/ron247/listen', { method: 'POST', token });
  },
  async stopListening(token) {
    return http('/ron247/stop', { method: 'POST', token });
  },

  // Handshake opcional
  async connect247(payload = {}, token) {
    return http('/ron247/connect', { method: 'POST', body: payload, token });
  },
};

export default ronApi;
