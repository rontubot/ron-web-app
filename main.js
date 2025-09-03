const { app, BrowserWindow, ipcMain } = require('electron');  
const path = require('path');  
const isDev = require('electron-is-dev');  
  
let mainWindow;  
  
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
  
  // Cargar la aplicación React  
  const startUrl = isDev   
    ? 'http://localhost:3000'   
    : `file://${path.join(__dirname, '../build/index.html')}`;  
    
  mainWindow.loadURL(startUrl);  
  
  if (isDev) {  
    mainWindow.webContents.openDevTools();  
  }  
  
  mainWindow.on('closed', () => {  
    mainWindow = null;  
  });  
}  
  
app.whenReady().then(createWindow);  
  
app.on('window-all-closed', () => {  
  if (process.platform !== 'darwin') {  
    app.quit();  
  }  
});  
  
app.on('activate', () => {  
  if (BrowserWindow.getAllWindows().length === 0) {  
    createWindow();  
  }  
});