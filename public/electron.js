const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs').promises;
const fs2 = require('fs');

// (opcional) variables de entorno para el proceso principal
try { require('dotenv').config(); } catch (_) {}

// ========= fetch en PROCESO PRINCIPAL (seguro para build) =========
const fetchImpl = global.fetch || (async (...args) => {
  const mod = await import('node-fetch'); // npm i node-fetch@3 si Node < 18
  return mod.default(...args);
});

// (opcional) URL backend si luego usas el proxy IPC ron:req
const API_URL = process.env.RON_API_URL || 'https://';

let mainWindow;
let ronPythonProcess = null;
let ron247Status = 'inactive'; // 'inactive' | 'starting' | 'listening' | 'conversing'

// --------- Util: ruta robusta para preload en dev y build ----------
function getPreloadPath() {
  if (!app.isPackaged) {
    // Dev: como lo tienes ahora
    return path.join(__dirname, '../preload.js');
  }

  // Build: probar ubicaciones más comunes
  const candidates = [
    // 1) donde intentabas
    path.join(process.resourcesPath, 'preload.js'),
    // 2) dentro de app.asar (si lo empacaste ahí)
    path.join(process.resourcesPath, 'app.asar', 'preload.js'),
    // 3) junto al ejecutable (tu caso actual: win-unpacked\preload.js)
    path.join(path.dirname(process.execPath), 'preload.js'),
  ];

  for (const p of candidates) {
    try { if (fs2.existsSync(p)) return p; } catch (_) {}
  }

  // Último recurso: log y devuelve la opción “junto al exe”
  const fallback = path.join(path.dirname(process.execPath), 'preload.js');
  console.warn('[Electron] preload no encontrado en ubicaciones estándar. Usando fallback:', fallback);
  return fallback;
}

// --------- Descarga de scripts Python a una carpeta writable ----------
async function downloadPythonFiles() {
  const baseUrl = 'https://raw.githubusercontent.com/rontubot/Ron/main';
  const baseDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'python-scripts')
    : path.join(process.cwd(), 'python-scripts');

  const files = [
    { url: `${baseUrl}/local/ron_launcher.py`, path: path.join(baseDir, 'ron_launcher.py') },
    { url: `${baseUrl}/core/assistant.py`, path: path.join(baseDir, 'core', 'assistant.py') },
    { url: `${baseUrl}/core/memory.py`, path: path.join(baseDir, 'core', 'memory.py') },
    { url: `${baseUrl}/core/commands.py`, path: path.join(baseDir, 'core', 'commands.py') },
  ];

  try {
    await fs.mkdir(path.join(baseDir, 'core'), { recursive: true });

    for (const file of files) {
      console.log(`📥 Descargando ${file.url}...`);
      const res = await fetchImpl(file.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${file.url}`);
      const content = await res.text();
      await fs.writeFile(file.path, content);
    }

    console.log('✅ Archivos Python descargados en:', baseDir);
    return { baseDir };
  } catch (error) {
    console.error('❌ Error descargando desde GitHub:', error);
    // Fallback: verificar si ya existen localmente
    const fallback = app.isPackaged
      ? path.join(app.getPath('userData'), 'python-scripts', 'ron_launcher.py')
      : path.join(process.cwd(), 'python-scripts', 'ron_launcher.py');

    try {
      await fs.access(fallback);
      console.log('📁 Usando archivos locales como fallback en:', path.dirname(fallback));
      return { baseDir: path.dirname(fallback) };
    } catch {
      throw new Error('No se pueden descargar archivos y no hay fallback local');
    }
  }
}

// --------- Ventana principal ----------
function createWindow() {
  const preloadPath = getPreloadPath();
  try {
    const exists = require('fs').existsSync(preloadPath);
    console.log('[Electron] preload =', preloadPath, 'exists?', exists);
  } catch (_) {}

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: preloadPath,
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3000' // cambia a 5173 si usas Vite
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);
  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    if (ronPythonProcess) ronPythonProcess.kill();
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    console.error('did-fail-load', { code, desc, url, isMainFrame });
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('Renderer crashed:', details);
  });
}

// --------- Socket helper para comandos al proceso Python ----------


async function sendCommandToRon(command) {
  const tryConnect = (host) => new Promise((resolve, reject) => {
    const client = new (require('net').Socket)();

    client.once('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.setTimeout(4000, () => {
      client.destroy();
      reject(new Error(`Socket timeout to ${host}:9999`));
    });

    client.connect(9999, host, () => {
      client.write(command);
    });

    client.on('data', (data) => {
      const response = data.toString().trim();
      client.destroy();
      resolve(response);
    });
  });

  // 1º IPv4; 2º fallback a localhost (por si el server cambiara)
  try {
    return await tryConnect('127.0.0.1');
  } catch (_e) {
    return await tryConnect('localhost');
  }
}
// ==================== IPC: Ron 24/7 ====================

ipcMain.handle('start-ron-247', async (_event, userData) => {
  try {
    if (ronPythonProcess) {
      return { success: false, message: 'Ron 24/7 ya está ejecutándose' };
    }

    console.log('🔄 Descargando/validando scripts Python...');
    const { baseDir } = await downloadPythonFiles();
    const pythonScriptPath = path.join(baseDir, 'ron_launcher.py');

    // Lanzar Python con UTF-8 forzado (Windows safe)
    const args = [
      '-X', 'utf8',
      pythonScriptPath,
      '--username', userData?.username || '',
      '--control-port', '9999',
    ];
    console.log('[RON] launching python:', 'python', args);

    ronPythonProcess = spawn('python', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    });

    // Errores al lanzar
    ronPythonProcess.on('error', (err) => {
      console.error('[RON] error al lanzar Python:', err);
      ron247Status = 'inactive';
      mainWindow?.webContents.send('ron-247-status-changed', 'inactive');
    });

    ron247Status = 'starting';

    // Salida estándar
    ronPythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Ron 24/7 output:', output);

      if (output.includes('Control server listening')) {
        ron247Status = 'listening';
        mainWindow?.webContents.send('ron-247-status-changed', 'listening');
      }
      mainWindow?.webContents.send('ron-247-output', output);
    });

    // Errores de Python (stderr)
    ronPythonProcess.stderr.on('data', (data) => {
      console.error('Ron 24/7 error:', data.toString());
    });

    // Fin del proceso
    ronPythonProcess.on('close', (code) => {
      console.log(`Ron 24/7 process exited with code ${code}`);
      ronPythonProcess = null;
      ron247Status = 'inactive';
      mainWindow?.webContents.send('ron-247-status-changed', 'inactive');
    });

    // pequeño delay para dar tiempo a iniciar
    await new Promise((r) => setTimeout(r, 3000));

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

    try {
      await sendCommandToRon('STOP');
      console.log('Comando STOP enviado via socket');
    } catch {
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

ipcMain.handle('toggle-ron-247-listening', async () => {
  try {
    if (!ronPythonProcess) {
      return { success: false, message: 'Ron 24/7 no está ejecutándose' };
    }
    const command = ron247Status === 'listening' ? 'STOP' : 'START';
    await sendCommandToRon(command);

    ron247Status = command === 'START' ? 'listening' : 'inactive';
    mainWindow?.webContents.send('ron-247-status-changed', ron247Status);

    return {
      success: true,
      message: `Ron 24/7 ${command === 'START' ? 'activado' : 'desactivado'}`,
      status: ron247Status,
    };
  } catch (error) {
    console.error('Error toggling Ron 24/7:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('get-ron-247-status', async () => {
  if (ronPythonProcess) {
    try {
      const socketStatus = await sendCommandToRon('STATUS');
      ron247Status = socketStatus === 'ACTIVE' ? 'listening' : 'inactive';
    } catch (error) {
      console.log('No se pudo verificar estado via socket:', error.message);
    }
  }
  return { status: ron247Status, isRunning: ronPythonProcess !== null };
});

// ============= OPCIONAL: Proxy HTTP por IPC (evita CORS) =============
ipcMain.handle('ron:req', async (_evt, { path: subpath = '/', method = 'GET', headers = {}, body } = {}) => {
  try {
    const url = `${API_URL}${subpath.startsWith('/') ? '' : '/'}${subpath}`;
    const res = await fetchImpl(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = { text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('ron:req error', err);
    return { ok: false, status: 0, data: { error: String(err) } };
  }
});

// --------- ciclo de vida ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (ronPythonProcess) ronPythonProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (ronPythonProcess && !ronPythonProcess.killed) {
    ronPythonProcess.kill('SIGTERM');
  }
});