const express = require('express');  
const path = require('path');  
const jwt = require('jsonwebtoken');  
const bcrypt = require('bcryptjs');  
const cors = require('cors');  
const axios = require('axios');  
require('dotenv').config();  
  
const app = express();  
const PORT = process.env.PORT || 3000;  
  
// Middleware  
app.use(cors());  
app.use(express.json());  
app.use(express.static(path.join(__dirname, 'build')));  
  
// JWT Secret  
const JWT_SECRET = process.env.JWT_SECRET || 'tu-jwt-secret-super-seguro';  
  
// Base de datos simulada en memoria (en producción usar una DB real)  
const users = new Map();  
const conversations = new Map();  
  
// URL del servidor de Ron existente  
const RON_API_URL = process.env.RON_API_URL || 'https://ron-production.up.railway.app';  
  
// Middleware de autenticación  
const authenticateToken = (req, res, next) => {  
  const authHeader = req.headers['authorization'];  
  const token = authHeader && authHeader.split(' ')[1];  
  
  if (!token) {  
    return res.status(401).json({ detail: 'Token de acceso requerido' });  
  }  
  
  jwt.verify(token, JWT_SECRET, (err, user) => {  
    if (err) {  
      return res.status(403).json({ detail: 'Token inválido' });  
    }  
    req.user = user;  
    next();  
  });  
};  
  
// Endpoints de autenticación  
app.post('/auth/register', async (req, res) => {  
  try {  
    const { username, password, email } = req.body;  
  
    if (!username || !password || !email) {  
      return res.status(400).json({ detail: 'Todos los campos son requeridos' });  
    }  
  
    if (users.has(username)) {  
      return res.status(400).json({ detail: 'El usuario ya existe' });  
    }  
  
    const hashedPassword = await bcrypt.hash(password, 10);  
    users.set(username, {  
      username,  
      password: hashedPassword,  
      email,  
      createdAt: new Date().toISOString()  
    });  
  
    conversations.set(username, []);  
  
    res.status(201).json({ message: 'Usuario creado exitosamente' });  
  } catch (error) {  
    res.status(500).json({ detail: 'Error interno del servidor' });  
  }  
});  
  
app.post('/auth/login', async (req, res) => {  
  try {  
    const { username, password } = req.body;  
  
    if (!username || !password) {  
      return res.status(400).json({ detail: 'Usuario y contraseña requeridos' });  
    }  
  
    const user = users.get(username);  
    if (!user) {  
      return res.status(401).json({ detail: 'Credenciales inválidas' });  
    }  
  
    const validPassword = await bcrypt.compare(password, user.password);  
    if (!validPassword) {  
      return res.status(401).json({ detail: 'Credenciales inválidas' });  
    }  
  
    const token = jwt.sign(  
      { username: user.username, email: user.email },  
      JWT_SECRET,  
      { expiresIn: '24h' }  
    );  
  
    res.json({  
      access_token: token,  
      username: user.username,  
      token_type: 'bearer'  
    });  
  } catch (error) {  
    res.status(500).json({ detail: 'Error interno del servidor' });  
  }  
});  
  
app.post('/auth/logout', authenticateToken, (req, res) => {  
  // En una implementación real, aquí invalidarías el token  
  res.json({ message: 'Sesión cerrada exitosamente' });  
});  
  
// Endpoints de usuario  
app.get('/user/profile', authenticateToken, (req, res) => {  
  const user = users.get(req.user.username);  
  if (!user) {  
    return res.status(404).json({ detail: 'Usuario no encontrado' });  
  }  
  
  res.json({  
    username: user.username,  
    email: user.email,  
    createdAt: user.createdAt  
  });  
});  
  
app.get('/user/conversations', authenticateToken, (req, res) => {  
  const userConversations = conversations.get(req.user.username) || [];  
  res.json({  
    conversations: userConversations  
  });  
});  
  
// Endpoint principal de chat - integración con el servidor de Ron existente  
app.post('/ron', authenticateToken, async (req, res) => {  
  try {  
    const { text } = req.body;  
  
    if (!text) {  
      return res.status(400).json({ detail: 'Texto requerido' });  
    }  
  
    // Llamar al servidor de Ron existente  
    const response = await axios.post(`${RON_API_URL}/ron`, {  
      text: text  
    }, {  
      headers: {  
        'Content-Type': 'application/json'  
      },  
      timeout: 30000  
    });  
  
    const ronResponse = response.data.ron;  
  
    // Guardar la conversación  
    const userConversations = conversations.get(req.user.username) || [];  
    userConversations.push({  
      user: text,  
      ron: ronResponse,  
      timestamp: new Date().toISOString()  
    });  
    conversations.set(req.user.username, userConversations);  
  
    res.json({  
      ron: ronResponse,  
      shutdown: response.data.shutdown || false  
    });  
  
  } catch (error) {  
    console.error('Error al comunicarse con Ron:', error);  
      
    if (error.code === 'ECONNABORTED') {  
      return res.status(408).json({ detail: 'Timeout al comunicarse con Ron' });  
    }  
      
    if (error.response) {  
      return res.status(error.response.status).json({   
        detail: error.response.data.error || 'Error del servidor de Ron'   
      });  
    }  
  
    res.status(500).json({ detail: 'Error al comunicarse con Ron' });  
  }  
});  
  
// Endpoints de utilidad  
app.get('/health', async (req, res) => {  
  try {  
    // Verificar conectividad con el servidor de Ron  
    const ronHealth = await axios.get(`${RON_API_URL}/health`, { timeout: 5000 });  
      
    res.json({  
      status: 'ok',  
      ron_server: ronHealth.data,  
      timestamp: new Date().toISOString()  
    });  
  } catch (error) {  
    res.status(503).json({  
      status: 'degraded',  
      error: 'No se puede conectar con el servidor de Ron',  
      timestamp: new Date().toISOString()  
    });  
  }  
});  
  
app.get('/memory-status', authenticateToken, async (req, res) => {  
  try {  
    // Obtener estado de memoria del servidor de Ron  
    const ronMemory = await axios.get(`${RON_API_URL}/memory-status`, { timeout: 5000 });  
      
    const userConversations = conversations.get(req.user.username) || [];  
      
    res.json({  
      status: 'ok',  
      user_conversations: userConversations.length,  
      ron_memory: ronMemory.data,  
      timestamp: new Date().toISOString()  
    });  
  } catch (error) {  
    const userConversations = conversations.get(req.user.username) || [];  
      
    res.json({  
      status: 'partial',  
      user_conversations: userConversations.length,  
      ron_memory_error: 'No se puede obtener estado de memoria de Ron',  
      timestamp: new Date().toISOString()  
    });  
  }  
});  
  
// Servir la aplicación React para todas las rutas no-API  
app.get('*', (req, res) => {  
  res.sendFile(path.join(__dirname, 'build', 'index.html'));  
});  
  
// Manejo de errores global  
app.use((error, req, res, next) => {  
  console.error('Error no manejado:', error);  
  res.status(500).json({ detail: 'Error interno del servidor' });  
});  
  
app.listen(PORT, () => {  
  console.log(`Servidor ejecutándose en puerto ${PORT}`);  
  console.log(`Conectando con Ron API en: ${RON_API_URL}`);  
});  
  
module.exports = app;