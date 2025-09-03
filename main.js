const { app, BrowserWindow, ipcMain } = require('electron');  
const path = require('path');  
const isDev = require('electron-is-dev');  
const { spawn } = require('child_process');  
  
let mainWindow;  
let ronPythonProcess = null;  
let ron247Status = 'inactive'; // 'inactive', 'listening', 'conversing'  
  
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
  
// IPC Handlers para Ron 24/7  
ipcMain.handle('start-ron-247', async (event, userData) => {  
  try {  
    if (ronPythonProcess) {  
      return { success: false, message: 'Ron 24/7 ya está ejecutándose' };  
    }  
  
    // Ruta al ron_launcher.py (necesitarás ajustar esta ruta)  
    const pythonScriptPath = path.join(__dirname, '../../../Ron/local/ron_launcher.py');  
      
    // Iniciar proceso Python con argumentos de usuario  
    ronPythonProcess = spawn('python', [pythonScriptPath, '--username', userData.username], {  
      stdio: ['pipe', 'pipe', 'pipe']  
    });  
  
    ron247Status = 'listening';  
  
    // Manejar salida del proceso Python  
    ronPythonProcess.stdout.on('data', (data) => {  
      const output = data.toString();  
      console.log('Ron 24/7 output:', output);  
        
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
  
    return { success: true, message: 'Ron 24/7 iniciado correctamente' };  
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
  
    ronPythonProcess.kill();  
    ronPythonProcess = null;  
    ron247Status = 'inactive';  
  
    return { success: true, message: 'Ron 24/7 detenido correctamente' };  
  } catch (error) {  
    console.error('Error stopping Ron 24/7:', error);  
    return { success: false, message: error.message };  
  }  
});  
  
ipcMain.handle('get-ron-247-status', async () => {  
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