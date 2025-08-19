const express = require('express');  
const path = require('path');  
const jwt = require('jsonwebtoken');  
const bcrypt = require('bcryptjs');  
const cors = require('cors');  
const axios = require('axios');  
const fs = require('fs');  
require('dotenv').config();  
  
const app = express();  
const PORT = process.env.PORT || 3000;  
  
// Middleware básico  
app.use(cors());  
app.use(express.json());  
  
// LOGGING: Log de todas las peticiones entrantes  
app.use((req, res, next) => {  
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);  
  console.log(`📋 Headers:`, req.headers);  
  if (req.body && Object.keys(req.body).length > 0) {  
    console.log(`📦 Body:`, req.body);  
  }  
  next();  
});  
  
// Servir archivos estáticos de React  
app.use(express.static(path.join(__dirname, 'build')));  
  
// LOGGING: Verificar archivos estáticos  
app.use((req, res, next) => {  
  if (req.path.startsWith('/static/') || req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {  
    console.log(`📁 Archivo estático solicitado: ${req.path}`);  
  }  
  next();  
});  
  
// JWT Secret  
const JWT_SECRET = process.env.JWT_SECRET || '1925e2a0e6c8d8c196af044c77cc52dc';  
  
// Base de datos simulada en memoria  
const users = new Map();  
const conversations = new Map();  
  
// URL del servidor de Ron existente - CORREGIDA  
const RON_API_URL = process.env.RON_API_URL || 'https://ron-production.up.railway.app';  
  
// Middleware de autenticación  
const authenticateToken = (req, res, next) => {  
  const authHeader = req.headers['authorization'];  
  const token = authHeader && authHeader.split(' ')[1];  
  
  if (!token) {  
    console.log(`🔒 Token faltante en ${req.path}`);  
    return res.status(401).json({ detail: 'Token de acceso requerido' });  
  }  
  
  jwt.verify(token, JWT_SECRET, (err, user) => {  
    if (err) {  
      console.log(`🔒 Token inválido en ${req.path}:`, err.message);  
      return res.status(403).json({ detail: 'Token inválido' });  
    }  
    console.log(`✅ Token válido para usuario: ${user.username}`);  
    req.user = user;  
    next();  
  });  
};  
  
// Endpoints de autenticación  
app.post('/auth/register', async (req, res) => {  
  console.log(`🔐 Intento de registro para usuario: ${req.body.username}`);  
  try {  
    const { username, password, email } = req.body;  
  
    if (!username || !password || !email) {  
      console.log(`❌ Campos faltantes en registro`);  
      return res.status(400).json({ detail: 'Todos los campos son requeridos' });  
    }  
  
    if (users.has(username)) {  
      console.log(`❌ Usuario ${username} ya existe`);  
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
    console.log(`✅ Usuario ${username} registrado exitosamente`);  
  
    res.status(201).json({ message: 'Usuario creado exitosamente' });  
  } catch (error) {  
    console.error('❌ Error en registro:', error);  
    res.status(500).json({ detail: 'Error interno del servidor' });  
  }  
});  
  
app.post('/auth/login', async (req, res) => {  
  console.log(`🔐 Intento de login para usuario: ${req.body.username}`);  
  try {  
    const { username, password } = req.body;  
  
    if (!username || !password) {  
      console.log(`❌ Credenciales faltantes`);  
      return res.status(400).json({ detail: 'Usuario y contraseña requeridos' });  
    }  
  
    const user = users.get(username);  
    if (!user) {  
      console.log(`❌ Usuario ${username} no encontrado`);  
      return res.status(401).json({ detail: 'Credenciales inválidas' });  
    }  
  
    const validPassword = await bcrypt.compare(password, user.password);  
    if (!validPassword) {  
      console.log(`❌ Contraseña incorrecta para ${username}`);  
      return res.status(401).json({ detail: 'Credenciales inválidas' });  
    }  
  
    const token = jwt.sign(  
      { username: user.username, email: user.email },  
      JWT_SECRET,  
      { expiresIn: '24h' }  
    );  
  
    console.log(`✅ Login exitoso para ${username}`);  
  
    res.json({  
      access_token: token,  
      username: user.username,  
      token_type: 'bearer'  
    });  
  } catch (error) {  
    console.error('❌ Error en login:', error);  
    res.status(500).json({ detail: 'Error interno del servidor' });  
  }  
});  
  
app.post('/auth/logout', authenticateToken, (req, res) => {  
  console.log(`🔐 Logout para usuario: ${req.user.username}`);  
  res.json({ message: 'Sesión cerrada exitosamente' });  
});  
  
// Endpoints de usuario  
app.get('/user/profile', authenticateToken, (req, res) => {  
  console.log(`👤 Perfil solicitado para: ${req.user.username}`);  
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
  console.log(`💬 Conversaciones solicitadas para: ${req.user.username}`);  
  const userConversations = conversations.get(req.user.username) || [];  
  res.json({  
    conversations: userConversations  
  });  
});  
  
// Endpoint principal de chat  
app.post('/ron', authenticateToken, async (req, res) => {  
  console.log(`🤖 Chat solicitado por: ${req.user.username} - Texto: "${req.body.text}"`);  
  try {  
    const { text } = req.body;  
  
    if (!text) {  
      return res.status(400).json({ detail: 'Texto requerido' });  
    }  
  
    console.log(`🔗 Enviando petición a Ron API: ${RON_API_URL}/ron`);  
      
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
    console.log(`✅ Respuesta de Ron recibida: "${ronResponse}"`);  
  
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
    console.error('❌ Error al comunicarse con Ron:', error.message);  
      
    if (error.code === 'ECONNABORTED') {  
      return res.status(408).json({ detail: 'Timeout al comunicarse con Ron' });  
    }  
      
    if (error.response) {  
      console.error('❌ Error response de Ron:', error.response.status, error.response.data);  
      return res.status(error.response.status).json({   
        detail: error.response.data.error || 'Error del servidor de Ron'   
      });  
    }  
  
    res.status(500).json({ detail: 'Error al comunicarse con Ron' });  
  }  
});  
  
// Endpoints de utilidad  
app.get('/health', async (req, res) => {  
  console.log(`🏥 Health check solicitado`);  
  try {  
    console.log(`🔗 Verificando conectividad con: ${RON_API_URL}/health`);  
    const ronHealth = await axios.get(`${RON_API_URL}/health`, { timeout: 5000 });  
      
    console.log(`✅ Ron server health OK`);  
    res.json({  
      status: 'ok',  
      ron_server: ronHealth.data,  
      timestamp: new Date().toISOString()  
    });  
  } catch (error) {  
    console.error(`❌ No se puede conectar con Ron server:`, error.message);  
    res.status(503).json({  
      status: 'degraded',  
      error: 'No se puede conectar con el servidor de Ron',  
      timestamp: new Date().toISOString()  
    });  
  }  
});  
  
app.get('/memory-status', authenticateToken, async (req, res) => {  
  console.log(`🧠 Memory status solicitado por: ${req.user.username}`);  
  try {  
    const ronMemory = await axios.get(`${RON_API_URL}/memory-status`, { timeout: 5000 });  
    const userConversations = conversations.get(req.user.username) || [];  
      
    res.json({  
      status: 'ok',  
      user_conversations: userConversations.length,  
      ron_memory: ronMemory.data,  
      timestamp: new Date().toISOString()  
    });  
  } catch (error) {  
    console.error(`❌ Error obteniendo memory status:`, error.message);  
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
  console.log(`🌐 Ruta catch-all activada para: ${req.path}`);  
    
  const indexPath = path.join(__dirname, 'build', 'index.html');  
  console.log(`📂 Intentando servir: ${indexPath}`);  
    
  if (fs.existsSync(indexPath)) {  
    console.log(`✅ index.html existe, sirviendo archivo`);  
    res.sendFile(indexPath);  
  } else {  
    console.log(`❌ index.html NO existe en: ${indexPath}`);  
    res.status(404).json({ error: 'index.html no encontrado' });  
  }  
});  
  
// Manejo de errores global  
app.use((error, req, res, next) => {  
  console.error('💥 Error no manejado:', error);  
  res.status(500).json({ detail: 'Error interno del servidor' });  
});  
  
// Iniciar servidor  
app.listen(PORT, () => {  
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);  
  console.log(`🔗 Conectando con Ron API en: ${RON_API_URL}`);  
    
  // Verificar estructura de archivos  
  const buildPath = path.join(__dirname, 'build');  
  console.log(`📁 Verificando carpeta build en: ${buildPath}`);  
    
  if (fs.existsSync(buildPath)) {  
    console.log(`✅ Carpeta build existe`);  
    const files = fs.readdirSync(buildPath);  
    console.log(`📋 Archivos en build:`, files.slice(0, 10)); // Mostrar solo los primeros 10  
      
    // Verificar index.html específicamente  
    const indexPath = path.join(buildPath, 'index.html');  
    if (fs.existsSync(indexPath)) {  
      console.log(`✅ index.html confirmado en build/`);  
    } else {  
      console.log(`❌ index.html NO encontrado en build/`);  
    }  
  } else {  
    console.log(`❌ Carpeta build NO existe`);  
  }  
});  
  
module.exports = app;