const { app, BrowserWindow, ipcMain } = require('electron');      
const path = require('path');      
const isDev = require('electron-is-dev');      
const { spawn } = require('child_process');      
const net = require('net');  
const fs = require('fs').promises;  
const https = require('https');  
    
let mainWindow;      
let ronPythonProcess = null;      
let ron247Status = 'inactive'; // 'inactive', 'listening', 'conversing'      
  
// NUEVA: Función para descargar archivos desde GitHub  
async function downloadPythonFiles() {  
  const baseUrl = 'https://raw.githubusercontent.com/rontubot/Ron/main';  
  const files = [  
    { url: `${baseUrl}/local/ron_launcher.py`, path: 'python-scripts/ron_launcher.py' },  
    { url: `${baseUrl}/core/assistant.py`, path: 'python-scripts/core/assistant.py' },  
    { url: `${baseUrl}/core/memory.py`, path: 'python-scripts/core/memory.py' },  
    { url: `${baseUrl}/core/commands.py`, path: 'python-scripts/core/commands.py' }  
  ];  
  
  try {  
    // Crear directorios  
    await fs.mkdir('python-scripts/core', { recursive: true });  
      
    for (const file of files) {  
      console.log(`📥 Descargando ${file.url}...`);  
        
      // Usar fetch para descargar archivos  
      const response = await fetch(file.url);  
      if (!response.ok) {  
        throw new Error(`HTTP error! status: ${response.status}`);  
      }  
      const content = await response.text();  
      await fs.writeFile(file.path, content);  
    }  
      
    console.log('✅ Archivos Python descargados desde GitHub');  
    return true;  
  } catch (error) {  
    console.error('❌ Error descargando desde GitHub:', error);  
      
    // Verificar si existen archivos locales como fallback  
    const localPath = path.join(__dirname, 'python-scripts', 'ron_launcher.py');  
    try {  
      await fs.access(localPath);  
      console.log('📁 Usando archivos locales como fallback');  
      return true;  
    } catch {  
      throw new Error('No se pueden descargar archivos y no hay fallback local');  
    }  
  }  
}  
      
function createWindow() {      
  mainWindow = new BrowserWindow({      
    width: 1200,      
    height: 800,      
    webPreferences: {      
      nodeIntegration: false,      
      contextIsolation: true,      
      enableRemoteModule: false,      
      preload: path.join(__dirname, 'preload.js')      
    }      
  });      
      
  const startUrl = isDev       
    ? 'http://localhost:3000'       
    : `file://${path.join(__dirname, '../build/index.html')}`;      
        
  mainWindow.loadURL(startUrl);      
      
  if (isDev) {      
    mainWindow.webContents.openDevTools();      
  }      
      
  mainWindow.on('closed', () => {      
    // Cerrar proceso Python al cerrar la ventana      
    if (ronPythonProcess) {      
      ronPythonProcess.kill();      
    }      
    mainWindow = null;      
  });      
}      
    
// Función para comunicarse con el proceso Python via socket  
async function sendCommandToRon(command) {    
  return new Promise((resolve, reject) => {    
    const client = new net.Socket();    
        
    client.connect(9999, 'localhost', () => {    
      client.write(command);    
    });    
  
    client.on('data', (data) => {    
      const response = data.toString().trim();    
      client.destroy();    
      resolve(response);    
    });    
  
    client.on('error', (err) => {    
      client.destroy();    
      reject(err);    
    });    
  
    client.setTimeout(3000, () => {    
      client.destroy();    
      reject(new Error('Socket timeout - Ron process may not be responding'));    
    });    
  });    
}      
      
// IPC Handlers para Ron 24/7 (MODIFICADO para descarga dinámica)  
ipcMain.handle('start-ron-247', async (event, userData) => {      
  try {      
    if (ronPythonProcess) {      
      return { success: false, message: 'Ron 24/7 ya está ejecutándose' };      
    }      
      
    // NUEVO: Descargar archivos más recientes desde GitHub  
    console.log('🔄 Descargando archivos Python desde GitHub...');  
    await downloadPythonFiles();  
      
    // Usar ruta local temporal (después de la descarga)  
    const pythonScriptPath = path.join(__dirname, 'python-scripts', 'ron_launcher.py');  
          
    // Iniciar proceso Python con argumentos de usuario Y puerto de control    
    ronPythonProcess = spawn('python', [    
      pythonScriptPath,     
      '--username', userData.username,    
      '--control-port', '9999'    
    ], {      
      stdio: ['pipe', 'pipe', 'pipe']      
    });      
      
    ron247Status = 'starting';      
      
    // Manejar salida del proceso Python      
    ronPythonProcess.stdout.on('data', (data) => {      
      const output = data.toString();      
      console.log('Ron 24/7 output:', output);      
            
      // Detectar cuando el servidor de control está listo  
      if (output.includes('Control server listening')) {    
        ron247Status = 'listening';    
        if (mainWindow) {    
          mainWindow.webContents.send('ron-247-status-changed', 'listening');    
        }    
      }    
  
      // Enviar actualizaciones de estado a React      
      if (mainWindow) {      
        mainWindow.webContents.send('ron-247-output', output);      
      }      
    });      
      
    ronPythonProcess.stderr.on('data', (data) => {      
      console.error('Ron 24/7 error:', data.toString());      
    });      
      
    ronPythonProcess.on('close', (code) => {      
      console.log(`Ron 24/7 process exited with code ${code}`);      
      ronPythonProcess = null;      
      ron247Status = 'inactive';      
            
      if (mainWindow) {      
        mainWindow.webContents.send('ron-247-status-changed', 'inactive');      
      }      
    });      
  
    // Esperar un momento para que el proceso se inicie    
    await new Promise(resolve => setTimeout(resolve, 3000));    
      
    return { success: true, message: 'Ron 24/7 iniciado correctamente con archivos actualizados' };      
  } catch (error) {      
    console.error('Error starting Ron 24/7:', error);      
    return { success: false, message: error.message };      
  }      
});      
      
ipcMain.handle('stop-ron-247', async () => {      
  try {      
    if (!ronPythonProcess) {      
      return { success: false, message: 'Ron 24/7 no está ejecutándose' };      
    }      
  
    // Intentar enviar comando STOP via socket primero    
    try {    
      await sendCommandToRon('STOP');    
      console.log('Comando STOP enviado via socket');    
    } catch (socketError) {    
      console.log('Socket command failed, killing process directly');    
    }    
      
    ronPythonProcess.kill();      
    ronPythonProcess = null;      
    ron247Status = 'inactive';      
      
    return { success: true, message: 'Ron 24/7 detenido correctamente' };      
  } catch (error) {      
    console.error('Error stopping Ron 24/7:', error);      
    return { success: false, message: error.message };      
  }      
});      
  
// Handler para activar/desactivar listening    
ipcMain.handle('toggle-ron-247-listening', async () => {    
  try {    
    if (!ronPythonProcess) {    
      return { success: false, message: 'Ron 24/7 no está ejecutándose' };    
    }    
  
    const command = ron247Status === 'listening' ? 'STOP' : 'START';    
    const response = await sendCommandToRon(command);    
        
    ron247Status = command === 'START' ? 'listening' : 'inactive';    
        
    if (mainWindow) {    
      mainWindow.webContents.send('ron-247-status-changed', ron247Status);    
    }    
  
    return {     
      success: true,     
      message: `Ron 24/7 ${command === 'START' ? 'activado' : 'desactivado'}`,    
      status: ron247Status    
    };    
  } catch (error) {    
    console.error('Error toggling Ron 24/7:', error);    
    return { success: false, message: error.message };    
  }    
});    
      
ipcMain.handle('get-ron-247-status', async () => {      
  // Verificar estado real via socket si el proceso está corriendo    
  if (ronPythonProcess) {    
    try {    
      const socketStatus = await sendCommandToRon('STATUS');    
      const isActive = socketStatus === 'ACTIVE';    
      ron247Status = isActive ? 'listening' : 'inactive';    
    } catch (error) {    
      console.log('No se pudo verificar estado via socket:', error.message);    
    }    
  }    
  
  return {      
    status: ron247Status,      
    isRunning: ronPythonProcess !== null      
  };      
});      
      
app.whenReady().then(createWindow);      
      
app.on('window-all-closed', () => {      
  // Cerrar proceso Python al salir de la aplicación      
  if (ronPythonProcess) {      
    ronPythonProcess.kill();      
  }      
        
  if (process.platform !== 'darwin') {      
    app.quit();      
  }      
});      
      
app.on('activate', () => {      
  if (BrowserWindow.getAllWindows().length === 0) {      
    createWindow();      
  }      
});    
  
// Limpiar proceso Python antes de cerrar    
app.on('before-quit', () => {    
  if (ronPythonProcess && !ronPythonProcess.killed) {    
    ronPythonProcess.kill('SIGTERM');    
  }    
});