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
app.use(express.json({ limit: '10mb' })); 
app.use((req, res, next) => {  
  console.log('🔍 Raw body:', req.body);  
  console.log('🔍 Content-Type:', req.headers['content-type']);  
  next();  
});
  
// Middleware adicional para manejar diferentes Content-Types  
app.use(express.text());  
app.use(express.urlencoded({ extended: true }));  
  
// Middleware para forzar parsing de JSON  
app.use((req, res, next) => {  
  if (req.headers['content-type'] === 'text/plain;charset=UTF-8' && req.body) {  
    try {  
      req.body = JSON.parse(req.body);  
    } catch (e) {  
      console.log('❌ Error parsing JSON from text/plain:', e.message);  
    }  
  }  
  next();  
});

// Servir archivos estáticos de React  
app.use(express.static(path.join(__dirname, 'build')));  
  
// JWT Secret (para verificar tokens del servidor principal)  
const JWT_SECRET = process.env.JWT_SECRET || '1925e2a0e6c8d8c196af044c77cc52dc';  
  
// URL del servidor de Ron existente  
const RON_API_URL = process.env.RON_API_URL || 'https://ron-production.up.railway.app';  
  
// Middleware de autenticación (verifica tokens del servidor principal)  
const authenticateToken = async (req, res, next) => {  
  const authHeader = req.headers['authorization'];  
  const token = authHeader && authHeader.split(' ')[1];  
  
  if (!token) {  
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
      req.user = response.data;  
      next();  
    } else {  
      return res.status(403).json({ detail: 'Token inválido' });  
    }  
  } catch (error) {  
    return res.status(403).json({ detail: 'Token inválido' });  
  }  
};  
  
// Endpoints de autenticación - PROXY al servidor principal  
app.post('/auth/register', async (req, res) => {  
  try {  
    const response = await axios.post(`${RON_API_URL}/auth/register`, req.body, {  
      headers: {  
        'Content-Type': 'application/json'  
      },  
      timeout: 10000  
    });  
  
    res.status(response.status).json(response.data);  
  } catch (error) {  
    if (error.response) {  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      res.status(500).json({ detail: 'Error interno del servidor' });  
    }  
  }  
});  
  
app.post('/auth/login', async (req, res) => {  
  try {  
    const response = await axios.post(`${RON_API_URL}/auth/login`, req.body, {  
      headers: {  
        'Content-Type': 'application/json'  
      },  
      timeout: 10000  
    });  
  
    res.json(response.data);  
  } catch (error) {  
    if (error.response) {  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      res.status(500).json({ detail: 'Error interno del servidor' });  
    }  
  }  
});  
  
app.post('/auth/logout', authenticateToken, async (req, res) => {  
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
    res.json({ message: 'Sesión cerrada exitosamente' });  
  }  
});  
  
// Endpoints de usuario - PROXY al servidor principal  
app.get('/user/profile', authenticateToken, async (req, res) => {  
  try {  
    const response = await axios.get(`${RON_API_URL}/user/profile`, {  
      headers: {  
        'Authorization': req.headers['authorization']  
      },  
      timeout: 5000  
    });  
  
    res.json(response.data);  
  } catch (error) {  
    if (error.response) {  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      res.status(500).json({ detail: 'Error interno del servidor' });  
    }  
  }  
});  
  
app.get('/user/conversations', authenticateToken, async (req, res) => {  
  try {  
    const response = await axios.get(`${RON_API_URL}/user/conversations`, {  
      headers: {  
        'Authorization': req.headers['authorization']  
      },  
      timeout: 5000  
    });  
  
    res.json(response.data);  
  } catch (error) {  
    if (error.response) {  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      res.status(500).json({ detail: 'Error interno del servidor' });  
    }  
  }  
});  
  
// Endpoint principal de chat - PROXY al servidor principal con autenticación  
app.post('/ron', authenticateToken, async (req, res) => {  
  // Logging para diagnosticar el problema del campo text  
  console.log(`🤖 Proxy chat para: ${req.user.username}`);  
  console.log(`📦 Body completo recibido:`, JSON.stringify(req.body, null, 2));  
    
  try {  
    const { text } = req.body;  
    console.log(`📝 Campo text extraído: "${text}"`);  
    console.log(`📝 Tipo de text: ${typeof text}`);  
  
    if (!text) {  
      console.log(`❌ Texto faltante o undefined`);  
      return res.status(400).json({ detail: 'Texto requerido' });  
    }  
  
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
      return res.status(error.response.status).json({  
        detail: error.response.data.detail || 'Error del servidor de Ron'  
      });  
    }  
  
    res.status(500).json({ detail: 'Error al comunicarse con Ron' });  
  }  
});  
  
// Endpoints de utilidad - PROXY al servidor principal  
app.get('/health', async (req, res) => {  
  try {  
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
    const response = await axios.get(`${RON_API_URL}/memory-status`, {  
      headers: {  
        'Authorization': req.headers['authorization']  
      },  
      timeout: 5000  
    });  
        
    res.json(response.data);  
  } catch (error) {  
    res.json({  
      status: 'partial',  
      error: 'No se puede obtener estado de memoria de Ron',  
      timestamp: new Date().toISOString()  
    });  
  }  
});  
  
// Servir la aplicación React para todas las rutas no-API  
app.get('*', (req, res) => {  
  const indexPath = path.join(__dirname, 'build', 'index.html');  
    
  if (fs.existsSync(indexPath)) {  
    res.sendFile(indexPath);  
  } else {  
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
});  
  
module.exports = app;