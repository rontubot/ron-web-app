// src/services/api.js
const RAW_BASE = process.env.REACT_APP_API_URL || 'https://ron-production.up.railway.app';
const API_BASE_URL = RAW_BASE.replace(/\/+$/, ''); // normaliza: sin barra al final

class RonAPI {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const { method = 'GET', headers = {}, body } = options;

    const finalBody =
      body === undefined
        ? undefined
        : (typeof body === 'string' ? body : JSON.stringify(body));

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: finalBody,
    });

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = text; }

    if (!res.ok) {
      const msg =
        (data && (data.detail || data.error || data.message)) ||
        (text || `HTTP ${res.status}`);
      throw new Error(msg);
    }
    return data;
  }

  // --- Auth ---
  async register(username, password, email) {
    return this.request('/auth/register', {
      method: 'POST',
      body: { username, password, email },
    });
  }

  async login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  }

  async logout(token) {
    return this.request('/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Perfil del usuario autenticado
  async me(token) {
    return this.request('/user/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // --- Chat principal ---
  async chatWithRon(text, token, username = 'default') {
    // **Clave:** mandamos text Y message para compatibilidad con el backend actual
    return this.request('/ron', {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: {
        text,
        message: text,        // <- compat
        username,
        return_json: true,
        source: 'desktop',
      },
    });
  }

  // --- Historial del usuario ---
  async getUserConversations(token) {
    return this.request('/user/conversations', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // --- Utilidad ---
  async healthCheck() {
    return this.request('/health');
  }

  async getMemoryStatus(token) {
    return this.request('/memory-status', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // --- Fallbacks Ron 24/7 (modo web sin Electron) ---
  async status247(token) {
    return this.request('/ron247/status', {
      method: 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  }

  async start247(token) {
    return this.request('/ron247/start', {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: {},
    });
  }

  async stop247(token) {
    return this.request('/ron247/stop', {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: {},
    });
  }
}

export const ronAPI = new RonAPI();
export default ronAPI;
