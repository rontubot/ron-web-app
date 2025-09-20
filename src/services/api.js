const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://ron-app.up.railway.app';
  
class RonAPI {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Error en la petición');
    return data;  
  }  
  
  // Endpoints de autenticación  
  async register(username, password, email) {  
    return this.request('/auth/register', {  
      method: 'POST',  
      body: JSON.stringify({ username, password, email }),  
    });  
  }  
  
  async login(username, password) {  
    return this.request('/auth/login', {  
      method: 'POST',  
      body: JSON.stringify({ username, password }),  
    });  
  }  
  
  async logout(token) {  
    return this.request('/auth/logout', {  
      method: 'POST',  
      headers: {  
        'Authorization': `Bearer ${token}`,  
      },  
    });  
  }  
  
  // Endpoint principal de chat  
  async chatWithRon(text, token, username = 'default') {
    return this.request('/ron', {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        text,
        username,
        return_json: true,  // ← que el server devuelva { user_response, commands }
        source: 'desktop',  // ← etiqueta para tu backend (si la usas)
      }),
    });
  }

  
  async getUserConversations(token) {  
    return this.request('/user/conversations', {  
      method: 'GET',  
      headers: {  
        'Authorization': `Bearer ${token}`,  
      },  
    });  
  }  
  
  // Endpoints de utilidad  
  async healthCheck() {  
    return this.request('/health');  
  }  
  
  async getMemoryStatus(token) {  
    return this.request('/memory-status', {  
      method: 'GET',  
      headers: {  
        'Authorization': `Bearer ${token}`,  
      },  
    });  
  }  
}  

export const ronAPI = new RonAPI();
export default ronAPI;