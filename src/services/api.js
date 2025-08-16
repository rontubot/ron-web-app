const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://redesigned-potato-v67vjjrggwq7fpg7-3000.app.github.dev';  
  
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
  
    try {  
      const response = await fetch(url, config);  
      const data = await response.json();  
        
      if (!response.ok) {  
        throw new Error(data.detail || 'Error en la petición');  
      }  
        
      return data;  
    } catch (error) {  
      console.error('API Error:', error);  
      throw error;  
    }  
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
  async chatWithRon(text, token) {  
    return this.request('/ron', {  
      method: 'POST',  
      headers: {  
        'Authorization': `Bearer ${token}`,  
      },  
      body: JSON.stringify({ text }),  
    });  
  }  
  
  // Endpoints de usuario  
  async getUserProfile(token) {  
    return this.request('/user/profile', {  
      method: 'GET',  
      headers: {  
        'Authorization': `Bearer ${token}`,  
      },  
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