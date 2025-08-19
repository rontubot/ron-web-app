const express = require('express');  
const path = require('path');  
const jwt = require('jsonwebtoken');  
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
  
// JWT Secret (para verificar tokens del servidor principal)  
const JWT_SECRET = process.env.JWT_SECRET || '1925e2a0e6c8d8c196af044c77cc52dc';  
  
// URL del servidor de Ron existente - CORREGIDA  
const RON_API_URL = process.env.RON_API_URL || 'https://ron-production.up.railway.app';  
  
// Middleware de autenticación (verifica tokens del servidor principal)  
const authenticateToken = async (req, res, next) => {  
  const authHeader = req.headers['authorization'];  
  const token = authHeader && authHeader.split(' ')[1];  
  
  if (!token) {  
    console.log(`🔒 Token faltante en ${req.path}`);  
    return res.status(401).json({ detail: 'Token de acceso requerido' });  
  }  
  
  try {  
    // Verificar token con el servidor principal  
    const response = await axios.get(`${RON_API_URL}/user/profile`, {  
      headers: {  
        'Authorization': `Bearer ${token}`  
      },  
      timeout: 5000  
    });  
  
    if (response.status === 200) {  
      console.log(`✅ Token válido para usuario: ${response.data.username}`);  
      req.user = response.data;  
      next();  
    } else {  
      console.log(`🔒 Token inválido en ${req.path}`);  
      return res.status(403).json({ detail: 'Token inválido' });  
    }  
  } catch (error) {  
    console.log(`🔒 Error verificando token en ${req.path}:`, error.message);  
    return res.status(403).json({ detail: 'Token inválido' });  
  }  
};  
  
// Endpoints de autenticación - PROXY al servidor principal  
app.post('/auth/register', async (req, res) => {  
  console.log(`🔐 Proxy registro para usuario: ${req.body.username}`);  
  try {  
    const response = await axios.post(`${RON_API_URL}/auth/register`, req.body, {  
      headers: {  
        'Content-Type': 'application/json'  
      },  
      timeout: 10000  
    });  
  
    console.log(`✅ Usuario ${req.body.username} registrado exitosamente en servidor principal`);  
    res.status(response.status).json(response.data);  
  } catch (error) {  
    console.error('❌ Error en proxy registro:', error.message);  
    if (error.response) {  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      res.status(500).json({ detail: 'Error interno del servidor' });  
    }  
  }  
});  
  
app.post('/auth/login', async (req, res) => {  
  console.log(`🔐 Proxy login para usuario: ${req.body.username}`);  
  try {  
    const response = await axios.post(`${RON_API_URL}/auth/login`, req.body, {  
      headers: {  
        'Content-Type': 'application/json'  
      },  
      timeout: 10000  
    });  
  
    console.log(`✅ Login exitoso para ${req.body.username} en servidor principal`);  
    res.json(response.data);  
  } catch (error) {  
    console.error('❌ Error en proxy login:', error.message);  
    if (error.response) {  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      res.status(500).json({ detail: 'Error interno del servidor' });  
    }  
  }  
});  
  
app.post('/auth/logout', authenticateToken, async (req, res) => {  
  console.log(`🔐 Proxy logout para usuario: ${req.user.username}`);  
  try {  
    const response = await axios.post(`${RON_API_URL}/auth/logout`, {}, {  
      headers: {  
        'Authorization': req.headers['authorization'],  
        'Content-Type': 'application/json'  
      },  
      timeout: 5000  
    });  
  
    res.json(response.data);  
  } catch (error) {  
    console.error('❌ Error en proxy logout:', error.message);  
    res.json({ message: 'Sesión cerrada exitosamente' });  
  }  
});  
  
// Endpoints de usuario - PROXY al servidor principal  
app.get('/user/profile', authenticateToken, async (req, res) => {  
  console.log(`👤 Proxy perfil para: ${req.user.username}`);  
  try {  
    const response = await axios.get(`${RON_API_URL}/user/profile`, {  
      headers: {  
        'Authorization': req.headers['authorization']  
      },  
      timeout: 5000  
    });  
  
    res.json(response.data);  
  } catch (error) {  
    console.error('❌ Error en proxy perfil:', error.message);  
    if (error.response) {  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      res.status(500).json({ detail: 'Error interno del servidor' });  
    }  
  }  
});  
  
app.get('/user/conversations', authenticateToken, async (req, res) => {  
  console.log(`💬 Proxy conversaciones para: ${req.user.username}`);  
  try {  
    const response = await axios.get(`${RON_API_URL}/user/conversations`, {  
      headers: {  
        'Authorization': req.headers['authorization']  
      },  
      timeout: 5000  
    });  
  
    res.json(response.data);  
  } catch (error) {  
    console.error('❌ Error en proxy conversaciones:', error.message);  
    if (error.response) {  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      res.status(500).json({ detail: 'Error interno del servidor' });  
    }  
  }  
});  
  
// Endpoint principal de chat - PROXY al servidor principal con autenticación  
app.post('/ron', authenticateToken, async (req, res) => {  
  console.log(`🤖 Proxy chat para: ${req.user.username} - Texto: "${req.body.text}"`);  
  try {  
    const { text } = req.body;  
  
    if (!text) {  
      return res.status(400).json({ detail: 'Texto requerido' });  
    }  
  
    console.log(`🔗 Enviando petición autenticada a Ron API: ${RON_API_URL}/`);  
      
    // Llamar al servidor de Ron existente con autenticación  
    const response = await axios.post(`${RON_API_URL}/ron`, {  
      text: text  
    }, {  
      headers: {  
        'Authorization': req.headers['authorization'],  
        'Content-Type': 'application/json'  
      },  
      timeout: 30000  
    });  
  
    console.log(`✅ Respuesta de Ron recibida: "${response.data.ron}"`);  
  
    res.json({  
      ron: response.data.ron,  
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
        detail: error.response.data.detail || 'Error del servidor de Ron'   
      });  
    }  
  
    res.status(500).json({ detail: 'Error al comunicarse con Ron' });  
  }  
});  
  
// Endpoints de utilidad - PROXY al servidor principal  
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
  console.log(`🧠 Proxy memory status para: ${req.user.username}`);  
  try {  
    const response = await axios.get(`${RON_API_URL}/memory-status`, {  
      headers: {  
        'Authorization': req.headers['authorization']  
      },  
      timeout: 5000  
    });  
      
    res.json(response.data);  
  } catch (error) {  
    console.error(`❌ Error obteniendo memory status:`, error.message);  
    res.json({  
      status: 'partial',  
      error: 'No se puede obtener estado de memoria de Ron',  
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
    console.log(`📋 Archivos en build:`, files.slice(0, 10));  
      
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