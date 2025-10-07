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
const API_URL = (process.env.RON_API_URL || 'https://ron-production.up.railway.app').replace(/\/+$/, '');  
let AUTH_TOKEN = null;  
let mainWindow;  
let ronPythonProcess = null;  
let ron247Status = 'inactive'; // 'inactive' | 'starting' | 'listening' | 'conversing'  
  
// --------- Util: ruta robusta para preload en dev y build ----------  
function getPreloadPath() {  
  if (!app.isPackaged) {  
    return path.join(__dirname, '../preload.js');  
  }  
  
  const candidates = [  
    path.join(process.resourcesPath, 'preload.js'),  
    path.join(process.resourcesPath, 'app.asar', 'preload.js'),  
    path.join(path.dirname(process.execPath), 'preload.js'),  
  ];  
  
  for (const p of candidates) {  
    try { if (fs2.existsSync(p)) return p; } catch (_) {}  
  }  
  
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
    { url: `${baseUrl}/core/assistant.py`,     path: path.join(baseDir, 'core', 'assistant.py') },  
    { url: `${baseUrl}/core/memory.py`,        path: path.join(baseDir, 'core', 'memory.py') },  
    { url: `${baseUrl}/core/commands.py`,      path: path.join(baseDir, 'core', 'commands.py') },  
    { url: `${baseUrl}/core/profile.py`,       path: path.join(baseDir, 'core', 'profile.py') },  
    { url: `${baseUrl}/config.py`,             path: path.join(baseDir, 'config.py') },  
  ];  
  
  async function fetchText(url) {  
    const res = await fetchImpl(url);  
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);  
    return res.text();  
  }  
  
  try {  
    await fs.mkdir(path.join(baseDir, 'core'), { recursive: true });  
  
    const initPath = path.join(baseDir, 'core', '__init__.py');  
    try { await fs.access(initPath); } catch { await fs.writeFile(initPath, ''); }  
  
    for (const file of files) {  
      console.log(`📥 Descargando ${file.url}...`);  
      const content = await fetchText(file.url);  
      await fs.writeFile(file.path, content, 'utf8');  
    }  
  
    console.log('✅ Archivos Python descargados en:', baseDir);  
    return { baseDir };  
  } catch (error) {  
    console.error('❌ Error descargando desde GitHub:', error);  
  
    const fallbackLauncher = app.isPackaged  
      ? path.join(app.getPath('userData'), 'python-scripts', 'ron_launcher.py')  
      : path.join(process.cwd(), 'python-scripts', 'ron_launcher.py');  
  
    try {  
      await fs.access(fallbackLauncher);  
      console.log('📁 Usando archivos locales como fallback en:', path.dirname(fallbackLauncher));  
      return { baseDir: path.dirname(fallbackLauncher) };  
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
    ? 'http://localhost:3000'  
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
  
  try {  
    return await tryConnect('127.0.0.1');  
  } catch (_e) {  
    return await tryConnect('localhost');  
  }  
}  
  
// --------- Handlers IPC ----------  
ipcMain.handle('auth:set-token', async (_evt, token) => {  
  AUTH_TOKEN = (token || '').trim() || null;  
  return { ok: true };  
});  
  
ipcMain.handle('auth:get-token', async () => {   
  return { ok: true, token: AUTH_TOKEN };  
});  
  
ipcMain.handle('auth:clear-token', async () => {  
  AUTH_TOKEN = null;  
  return { ok: true };  
});  
  
// HANDLER AGREGADO: auth:set-api-base  
ipcMain.handle('auth:set-api-base', async (_evt, url) => {  
  const cleanUrl = (url || '').trim().replace(/\/+$/, ''); // CORREGIDO: sin backslash extra  
  if (cleanUrl) {  
    process.env.RON_API_URL = cleanUrl;  
    try {  
      const configPath = path.join(app.getPath('userData'), 'config.json');  
      let config = {};  
      try {  
        config = JSON.parse(fs2.readFileSync(configPath, 'utf-8'));  
      } catch {}  
      config.RON_API_URL = cleanUrl;  
      fs2.writeFileSync(configPath, JSON.stringify(config, null, 2));  
    } catch (err) {  
      console.warn('No se pudo guardar config.json:', err);  
    }  
  }  
  return { ok: true };  
});


// Handler para preguntas a Ron (chat de texto)  
ipcMain.handle('ask-ron', async (_evt, { text, username = 'default' } = {}) => {
  const q = (text || '').trim();
  if (!q) return { ok: false, text: 'Mensaje vacío' };

  // 1) Resolver base URL de la API
  const userData = app.getPath('userData');
  let apiBase = (process.env.RON_API_URL || '').trim();
  try {
    if (!apiBase && fs2.existsSync(path.join(userData, 'config.json'))) {
      const cfg = JSON.parse(fs2.readFileSync(path.join(userData, 'config.json'), 'utf-8'));
      apiBase = (cfg.RON_API_URL || '').trim();
    }
  } catch {}

  if (!apiBase) apiBase = 'https://ron-production.up.railway.app';

  // Limpieza segura de barras finales (sin regex frágiles)
  const base = (() => {
    let u = apiBase;
    while (u.endsWith('/')) u = u.slice(0, -1);
    return u;
  })();

  // Verificación robusta de URL
  let looksLikeUrl = false;
  try {
    const u = new URL(base);
    looksLikeUrl = (u.protocol === 'http:' || u.protocol === 'https:');
  } catch {}

  // 2) Intentar Railway primero si hay URL válida
  if (looksLikeUrl) {
    try {
      const res = await fetchImpl(`${base}/ron`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          text: q,
          message: q,
          username,
          return_json: true,
          source: 'desktop',
        }),
      });

      const raw = await res.text();
      console.log('[ask-ron] Raw response from Railway:', raw);

      let data;
      try {
        data = JSON.parse(raw);
        console.log('[ask-ron] Parsed data:', JSON.stringify(data, null, 2));
      } catch (e) {
        console.error('[ask-ron] JSON parse error:', e);
        data = { user_response: raw };
      }

      // Si hay comandos Y Ron 24/7 está activo, ejecutarlos localmente
      if (Array.isArray(data?.commands) && data.commands.length > 0) {
        console.log(`[ask-ron] Recibidos ${data.commands.length} comandos desde Railway`);

        if (!ronPythonProcess) {
          console.warn('[ask-ron] Ron 24/7 no está activo, no se pueden ejecutar comandos');
          mainWindow?.webContents.send('ron-247-output',
            '⚠️ Ron 24/7 no está activo. Inicia Ron 24/7 para ejecutar comandos localmente.\n'
          );
        } else {
          try {
            const payload = JSON.stringify({ commands: data.commands });
            console.log('[ask-ron] Enviando comandos al socket:', payload);

            const socketResponse = await sendCommandToRon(`EXEC::${payload}`);
            console.log('[ask-ron] Respuesta del socket:', socketResponse);

            mainWindow?.webContents.send('ron-247-output',
              `✅ ${data.commands.length} comando(s) ejecutado(s) localmente\n`
            );
          } catch (e) {
            console.error('[ask-ron] Error ejecutando comandos vía socket:', e);
            mainWindow?.webContents.send('ron-247-output',
              '❌ Error ejecutando comandos: Ron 24/7 no responde. Verifica que esté activo.\n'
            );
          }
        }
      } else {
        console.log('[ask-ron] No hay comandos para ejecutar');
      }

      const replyText =
        data?.user_response ??
        data?.ron ??
        data?.reply ??
        data?.text ??
        data?.message ??
        data?.message_text ??
        (typeof data === 'string' ? data : '') ??
        '';

      return { ok: res.ok, text: replyText || (res.ok ? 'Sin respuesta' : `Error ${res.status}`) };
    } catch (err) {
      console.warn('[ask-ron] fetch a Railway falló, uso fallback socket CHAT::', err?.message || err);
    }
  }

  // 4) Fallback: intentar socket directo (solo si Ron 24/7 está activo)
  if (!ronPythonProcess) {
    return {
      ok: false,
      text: 'Ron 24/7 no está ejecutándose. Inicia Ron 24/7 desde la interfaz para usar el chat de texto.'
    };
  }

  try {
    const resp = await sendCommandToRon(`CHAT::${q}`);
    return { ok: true, text: resp || 'Sin respuesta' };
  } catch (e) {
    console.error('[ask-ron] socket fallback también falló:', e);
    return { ok: false, text: 'No se pudo contactar a Ron 24/7. Verifica que esté ejecutándose.' };
  }
});

  
// Handler para iniciar Ron 24/7  
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
      '-u',             // salida sin buffer  
      '-X', 'utf8',  
      pythonScriptPath,  
      '--username', userData?.username || '',  
      '--control-port', '9999',  
    ];  
    console.log('[RON] launching python:', 'python', args);  
  
    ronPythonProcess = spawn('python', args, {  
      stdio: ['pipe', 'pipe', 'pipe'],  
      cwd: baseDir,  
      env: {  
        ...process.env,  
        PYTHONUTF8: '1',  
        PYTHONIOENCODING: 'utf-8',  
        PYTHONUNBUFFERED: '1',  
        PYTHONPATH: `${baseDir}${path.delimiter}${path.join(baseDir, 'core')}`,  
        RON_API_URL: API_URL,  
        RON_AUTH_TOKEN: AUTH_TOKEN || '',  
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
        // Activar automáticamente la escucha    
        setTimeout(async () => {    
          try {    
            await sendCommandToRon('START');    
            console.log('Escucha activada automáticamente');    
          } catch (error) {    
            console.error('Error activando escucha automáticamente:', error);    
          }    
        }, 1000); // Pequeño delay para asegurar que el socket esté listo  
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
  
// Handler para detener Ron 24/7  
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
  
// Handlers para grabación manual  
ipcMain.handle('start-manual-recording', async () => {    
  try {    
    if (!ronPythonProcess) {    
      return { success: false, message: 'Ron 24/7 no está ejecutándose' };    
    }    
        
    const response = await sendCommandToRon('START_MANUAL_RECORDING');    
        
    if (response === 'RECORDING_STARTED') {    
      return { success: true, message: 'Grabación manual iniciada' };    
    } else {    
      return { success: false, message: 'Error al iniciar grabación manual' };    
    }    
  } catch (error) {    
    console.error('Error starting manual recording:', error);    
    return { success: false, message: error.message };    
  }    
});    
    
ipcMain.handle('stop-manual-recording', async () => {    
  try {    
    if (!ronPythonProcess) {    
      return { success: false, message: 'Ron 24/7 no está ejecutándose' };    
    }    
        
    const response = await sendCommandToRon('STOP_MANUAL_RECORDING');    
        
    if (response === 'RECORDING_STOPPED') {    
      return { success: true, message: 'Grabación manual detenida y procesada' };    
    } else {    
      return { success: false, message: 'Error al detener grabación manual' };    
    }    
  } catch (error) {    
    console.error('Error stopping manual recording:', error);    
    return { success: false, message: error.message };    
  }    
});  
  
// Handler para obtener estado de Ron 24/7  
ipcMain.handle('get-ron-247-status', async () => {  
  if (ronPythonProcess) {  
    try {  
      const socketStatus = await sendCommandToRon('STATUS');  
      ron247Status = /ACTIVE|LISTENING|READY/i.test(String(socketStatus)) ? 'listening' : 'inactive';  
    } catch (error) {  
      console.log('No se pudo verificar estado via socket:', error.message);  
    }  
  }  
  return { status: ron247Status, isRunning: ronPythonProcess !== null };  
});  
  
// Proxy HTTP por IPC (evita CORS)  
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
  
// --------- Ciclo de vida de la aplicación ----------  
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