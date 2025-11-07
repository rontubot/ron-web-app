const { app, BrowserWindow, ipcMain } = require('electron');  
const path = require('path');  
const isDev = require('electron-is-dev');  
const { spawn } = require('child_process');  
const net = require('net');  
const fs = require('fs').promises;  
const fs2 = require('fs');  
const { TaskManager } = require("./taskManager");
let taskManager; // instancia global
const taskProcesses = new Map(); // taskId -> child_process

// Ejecuta una tarea local en segundo plano (por ahora: analyze_file)
function runBackgroundTask(task, username = 'default') {
  if (!task || !taskManager) return;

  // 🔹 Normalizar tipo de tarea: alias analyze_local_file → analyze_file
let action = task.kind || '';
let params = { ...(task.params || {}) };

// Alias: las tareas vienen como "analyze_file" pero el comando real es "analyze_local_file"
if (action === 'analyze_file') {
  if (params.path && !params.file_path) {
    params.file_path = params.path;
  }
  action = 'analyze_local_file';
}

  // Si la tarea es de archivo, comprobamos existencia si hay file_path o path
  const filePath = params.file_path || params.path;
  if (filePath && !fs2.existsSync(filePath)) {
    console.warn('[TaskManager] Archivo no encontrado para tarea', task.id, filePath);
    taskManager.updateTask(task.id, {
      status: 'failed',
      progress: 0,
      error: `No se encontró el archivo: ${filePath}`,
    });
    return;
  }

  // Pasamos a RUNNING
  taskManager.updateTask(task.id, {
    status: 'running',
    progress: 5,
  });

  const pythonScriptsDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'python-scripts')
    : path.join(process.cwd(), 'python-scripts');

  const payload = { action, params };

  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    RON_API_URL: API_URL,
    RON_AUTH_TOKEN: AUTH_TOKEN || '',
    RON_TASK_USERNAME: username || 'default',
    // JSON con acción + params
    RON_TASK_PAYLOAD: JSON.stringify(payload),
  };

  const pythonCode = `\
import sys
import os
import json

sys.path.insert(0, r"${pythonScriptsDir}")
sys.path.insert(0, r"${path.join(pythonScriptsDir, 'core')}")

from core.commands import run_command

commands = json.loads('${commandsJson}')

results = []
for cmd in commands:
    action = cmd.get('action', '')
    params = cmd.get('params', {})
    if action:
        try:
            result = run_command(action, params, {'username': '${username}'})
            ok = result.get('ok', True) if isinstance(result, dict) else True
            msg = None
            err = None

            if isinstance(result, dict):
                msg = result.get('message')
                err = result.get('error')
            if not msg and err:
                msg = err
            if msg is None:
                msg = str(result)

            item = {
                'action': action,
                'ok': ok,
                'message': msg,
            }
            if err:
                item['error'] = err

            results.append(item)
        except Exception as e:
            results.append({
                'action': action,
                'ok': False,
                'error': str(e),
                'message': str(e),
            })

print(json.dumps(results, ensure_ascii=False))

`;

  const pythonProcess = spawn('python', ['-u', '-c', pythonCode], {
    cwd: pythonScriptsDir,
    env,
  });

  // 👇 guardamos el proceso para poder cancelarlo después
  taskProcesses.set(task.id, pythonProcess);

  let output = '';
  let errorOutput = '';

  pythonProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    const text = data.toString();
    errorOutput += text;
    console.log('[TaskManager Python stderr]', text);
  });

  pythonProcess.on('close', (code) => {
    taskProcesses.delete(task.id);
    if (!taskManager) return;

    // si el usuario la marcó como cancelada, no sobreescribimos el estado
    const current = taskManager.getTask(task.id);
    if (!current || current.status === 'cancelled') {
      return;
    }

    if (code === 0 && output) {
      try {
        const payload = JSON.parse(output);
        if (payload.ok) {
          taskManager.updateTask(task.id, {
            status: 'completed',
            progress: 100,
            result_summary: payload.summary || 'Tarea completada.',
            error: null,
          });
        } else {
          taskManager.updateTask(task.id, {
            status: 'failed',
            progress: 100,
            error: payload.error || 'Error desconocido en la tarea.',
          });
        }
      } catch (e) {
        console.error('[TaskManager] Error parseando output de tarea:', e);
        taskManager.updateTask(task.id, {
          status: 'failed',
          progress: 100,
          error: 'Error al interpretar el resultado de la tarea.',
        });
      }
    } else {
      taskManager.updateTask(task.id, {
        status: 'failed',
        progress: 100,
        error: errorOutput || `Proceso Python terminó con código ${code}`,
      });
    }
  });

  pythonProcess.on('error', (err) => {
    console.error('[TaskManager] Error ejecutando Python para tarea:', err);
    taskProcesses.delete(task.id);
    if (!taskManager) return;
    taskManager.updateTask(task.id, {
      status: 'failed',
      progress: 0,
      error: String(err),
    });
  });
}

// >>> PATCH (arriba):
const { TextDecoder } = require('util');

// >>> PATCH: helpers para evitar handlers/eventos duplicados
function safeHandle(channel, fn) {
  try { ipcMain.removeHandler(channel); } catch {}
  ipcMain.handle(channel, fn);
}
function safeOn(channel, listener) {
  ipcMain.removeAllListeners(channel);
  ipcMain.on(channel, listener);
}

  
// (opcional) variables de entorno para el proceso principal  
try { require('dotenv').config(); } catch (_) {}  
  
// ========= fetch en PROCESO PRINCIPAL (seguro para build) =========  
const fetchImpl = global.fetch || (async (...args) => {  
  const mod = await import('node-fetch'); // npm i node-fetch@3 si Node < 18  
  return mod.default(...args);  
});  
  
// (opcional) URL backend si luego usas el proxy IPC ron:req  
let API_URL = (process.env.RON_API_URL || 'https://ron-production.up.railway.app').replace(/\/+$/, '');  
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
    
  // NUEVO: Verificar si las dependencias ya están instaladas  
  const depsInstalledMarker = path.join(baseDir, '.deps_installed');  
  let depsAlreadyInstalled = false;  
  try {  
    await fs.access(depsInstalledMarker);  
    depsAlreadyInstalled = true;  
    console.log('✅ Dependencias ya instaladas, saltando instalación');  
  } catch {  
    console.log('📦 Primera instalación de dependencias');  
  }  
  
  const files = [    
    { url: `${baseUrl}/local/ron_launcher.py`, path: path.join(baseDir, 'ron_launcher.py') },    
    { url: `${baseUrl}/core/assistant.py`,     path: path.join(baseDir, 'core', 'assistant.py') },    
    { url: `${baseUrl}/core/memory.py`,        path: path.join(baseDir, 'core', 'memory.py') },    
    { url: `${baseUrl}/core/commands.py`,      path: path.join(baseDir, 'core', 'commands.py') },    
    { url: `${baseUrl}/core/profile.py`,       path: path.join(baseDir, 'core', 'profile.py') },    
    { url: `${baseUrl}/config.py`,             path: path.join(baseDir, 'config.py') },    
    { url: `${baseUrl}/core/autonomous.py`,    path: path.join(baseDir, 'core', 'autonomous.py') },  
    { url: `${baseUrl}/core/task_manager.py`,  path: path.join(baseDir, 'core', 'task_manager.py') },
  ];    
    
  async function fetchText(url) {    
    const res = await fetchImpl(url);    
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);    
    return res.text();    
  }    
    
  try {  
    // Notificar inicio de descarga  
    mainWindow?.webContents.send('download-progress', {  
      stage: 'downloading',  
      message: 'Descargando archivos de Ron desde GitHub...'  
    });  
  
    await fs.mkdir(path.join(baseDir, 'core'), { recursive: true });    
    
    const initPath = path.join(baseDir, 'core', '__init__.py');    
    try { await fs.access(initPath); } catch { await fs.writeFile(initPath, ''); }    
    
    for (const file of files) {    
      console.log(`📥 Descargando ${file.url}...`);    
      const content = await fetchText(file.url);    
      await fs.writeFile(file.path, content, 'utf8');    
    }    
    
    console.log('✅ Archivos Python descargados en:', baseDir);  
      
    // Solo instalar dependencias si no están instaladas  
    if (!depsAlreadyInstalled) {  
      try {  
        // Notificar inicio de instalación  
        mainWindow?.webContents.send('download-progress', {  
          stage: 'installing',  
          message: 'Instalando dependencias Python (primera vez)...'  
        });  
  
        console.log('📦 Descargando requirements.txt...');  
        const reqUrl = `${baseUrl}/requirements.txt`;  
        const reqContent = await fetchText(reqUrl);  
        const reqPath = path.join(baseDir, 'requirements.txt');  
        await fs.writeFile(reqPath, reqContent, 'utf8');  
          
        console.log('📦 Instalando dependencias Python...');  
        const pipProcess = spawn('python', ['-m', 'pip', 'install', '--user', '-r', reqPath], {  
          stdio: 'inherit'  
        });  
          
        await new Promise((resolve, reject) => {  
          pipProcess.on('close', async (code) => {  
            if (code === 0) {  
              console.log('✅ Dependencias Python instaladas correctamente');  
              // Crear archivo marcador  
              await fs.writeFile(depsInstalledMarker, new Date().toISOString(), 'utf8');  
              resolve();  
            } else {  
              console.warn('⚠️ Algunas dependencias no se pudieron instalar (código:', code, ')');  
              resolve(); // No fallar si pip falla  
            }  
          });  
          pipProcess.on('error', (err) => {  
            console.error('❌ Error instalando dependencias:', err);  
            resolve(); // Continuar aunque falle  
          });  
        });  
      } catch (error) {  
        console.warn('⚠️ No se pudieron instalar dependencias automáticamente:', error);  
      }  
    }  
  
    // Notificar completado  
    mainWindow?.webContents.send('download-progress', {  
      stage: 'complete',  
      message: 'Archivos listos'  
    });  
      
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
  // 🔹 Instanciar TaskManager con la ventana principal
  taskManager = new TaskManager(mainWindow);

  const startUrl = isDev  
    ? 'http://localhost:3000'  
    : `file://${path.join(__dirname, '../build/index.html')}`;  
  
  mainWindow.loadURL(startUrl);  
  if (isDev) mainWindow.webContents.openDevTools();  
  
  mainWindow.on('closed', () => {  
    if (ronPythonProcess) ronPythonProcess.kill();  
    mainWindow = null;
    taskManager = null;
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


// --------- multitasks ---------- 
safeHandle("tasks:clear-completed", async () => {
  if (!taskManager) return { ok: false, message: "TaskManager no inicializado" };
  const cleared = taskManager.clearCompleted();
  return { ok: true, cleared };
});

safeHandle("tasks:delete", async (_e, id) => {
  if (!taskManager || !id) return { ok: false };

  const proc = taskProcesses.get(id);
  if (proc && !proc.killed) {
    try { proc.kill('SIGTERM'); } catch (_) {}
    taskProcesses.delete(id);
  }

  const deleted = taskManager.deleteTask(id);
  return { ok: deleted };
});

safeHandle("tasks:cancel", async (_e, id) => {
  if (!taskManager || !id) return { ok: false };
  const t = taskManager.getTask(id);
  if (!t) return { ok: false };

  // marcamos como cancelada
  taskManager.updateTask(id, {
    status: 'cancelled',
  });

  const proc = taskProcesses.get(id);
  if (proc && !proc.killed) {
    try { proc.kill('SIGTERM'); } catch (_) {}
    taskProcesses.delete(id);
  }

  return { ok: true };
});


//-------------- botón de Actualización ------------
safeHandle('python:update-scripts', async () => {
  try {
    const { baseDir } = await downloadPythonFiles();
    return { ok: true, baseDir };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});



  
// --------- Handlers IPC ----------  
safeHandle('auth:set-token', async (_evt, token) => {  
  AUTH_TOKEN = (token || '').trim() || null;  
  return { ok: true };  
});  
  
safeHandle('auth:get-token', async () => {   
  return { ok: true, token: AUTH_TOKEN };  
});  
  
safeHandle('auth:clear-token', async () => {  
  AUTH_TOKEN = null;  
  return { ok: true };  
});  
  
// HANDLER AGREGADO: auth:set-api-base  
safeHandle('auth:set-api-base', async (_evt, url) => {
  const cleanUrl = (url || '').trim().replace(/\/+$/, '');
  if (cleanUrl) {
    // 1) actualiza variable en memoria (afecta inmediatamente a 'ron:req', etc.)
    API_URL = cleanUrl;

    // 2) persiste en env y config (para siguientes arranques)
    process.env.RON_API_URL = cleanUrl;
    try {
      const configPath = path.join(app.getPath('userData'), 'config.json');
      let config = {};
      try { config = JSON.parse(fs2.readFileSync(configPath, 'utf-8')); } catch {}
      config.RON_API_URL = cleanUrl;
      fs2.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.warn('No se pudo guardar config.json:', err);
    }
  }
  return { ok: true, base: API_URL };
});



safeHandle('tasks:list', async () => {
  // Por si acaso se llama antes de que exista el TaskManager
  if (!taskManager) return [];
  return taskManager.getTasks();
});

safeHandle('tasks:get', async (_e, id) => {
  if (!taskManager) return null;
  return taskManager.getTask(id);
});



safeHandle('ask-ron-stream', async (_evt, { text, username = 'default' } = {}) => {  
  const q = (text || '').trim();  
  if (!q) return { ok: false, text: 'Mensaje vacío' };  
  
  // Resolver base URL
  const userData = app.getPath('userData');  
  let apiBase = (process.env.RON_API_URL || '').trim();  
  try {  
    if (!apiBase && fs2.existsSync(path.join(userData, 'config.json'))) {  
      const cfg = JSON.parse(fs2.readFileSync(path.join(userData, 'config.json'), 'utf-8'));  
      apiBase = (cfg.RON_API_URL || '').trim();  
    }  
  } catch {}  
  if (!apiBase) apiBase = API_URL;  
  while (apiBase.endsWith('/')) apiBase = apiBase.slice(0, -1);  
  
  console.log('[ask-ron-stream] base =', apiBase, 'token?', !!AUTH_TOKEN);  
  
  // ---- Fallback a /ron normal, simulando "chunks" ----  
  const fallbackToNonStream = async () => {  
    try {  
      const res = await fetchImpl(`${apiBase}/ron`, {  
        method: 'POST',  
        headers: {  
          'Content-Type': 'application/json',  
          ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),  
        },  
        body: JSON.stringify({ text: q, message: q, username, return_json: true, source: 'desktop' }),  
      });  
  
      const raw = await res.text();  
      let data; 
      try { 
        data = JSON.parse(raw); 
      } catch { 
        data = { user_response: raw }; 
      }  
  
      const full = (data?.user_response || data?.ron || '').toString();  
      if (!full) throw new Error('Respuesta vacía');  
  
      const parts = full.split(/(\.\s+|\n+)/).filter(Boolean);  
      for (const part of parts) { 
        mainWindow?.webContents.send('stream-chunk', part);  
      }
      mainWindow?.webContents.send('stream-done');  
      return { ok: true, streaming: false };  
    } catch (err) {  
      console.error('[ask-ron-stream] fallback error:', err);  
      mainWindow?.webContents.send('stream-error', err?.message || String(err));  
      return { ok: false, text: 'Error en streaming (fallback)' };  
    }  
  };  

  // ---- Streaming SSE real ----
  try {  
    const res = await fetchImpl(`${apiBase}/ron/stream`, {  
      method: 'POST',  
      headers: {  
        'Content-Type': 'application/json',  
        'Accept': 'text/event-stream',  
        ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),  
      },  
      body: JSON.stringify({ text: q, username }),  
    });  
  
    if (!res.ok) {  
      console.warn(`[ask-ron-stream] HTTP ${res.status}, usando fallback`);  
      if (res.status === 404 || res.status === 401) return await fallbackToNonStream();  
      throw new Error(`HTTP ${res.status}`);  
    }  
  
    const reader = res.body.getReader();  
    const decoder = new TextDecoder();  
    let buffer = '';  
    let receivedCommands = null;  
    let hasAnyChunk = false;
  
    while (true) {  
      const { done, value } = await reader.read();  
      if (done) break;  
  
      buffer += decoder.decode(value, { stream: true });  
      const lines = buffer.split('\n');  
      buffer = lines.pop() || '';  
  
      for (const line of lines) {    
        if (!line || !line.startsWith('data: ')) continue;    
    
        try {    
          const data = JSON.parse(line.slice(6));    
          
          // 🔹 Texto de progreso (type=progress + chunk)
          if (data.type === 'progress' && data.chunk) {    
            mainWindow?.webContents.send('stream-chunk', data.chunk);    
            continue;    
          }    

          // 🔹 Texto en trozos (type=chunk) — streaming real
          if (data.type === 'chunk' && data.chunk) {
            hasAnyChunk = true;
            mainWindow?.webContents.send('stream-chunk', data.chunk);
            continue;
          }

          // Guardar comandos si vienen en cualquier evento
          if (Array.isArray(data.commands) && data.commands.length > 0) {    
            receivedCommands = data.commands;    
          }  

          // 🔹 Error explícito
          if (data.type === 'error' || data.error) {    
            const errMsg = data.error || 'Error en streaming';  
            mainWindow?.webContents.send('stream-error', errMsg);    
            return { ok: false, error: errMsg };    
          }  

          // 🔹 FIN: type=done o data.done == true
          if (data.type === 'done' || data.done) {
            // 🔹 Solo mandamos full_text si *no* se mandó ningún chunk antes.
            //    Esto evita duplicar el texto completo.
            if (!hasAnyChunk && data.full_text) {
              mainWindow?.webContents.send('stream-chunk', data.full_text);
            }

            // ---- procesar comandos (queue_local_task + resto) ----
            if (Array.isArray(receivedCommands) && receivedCommands.length > 0) {    
              const pythonCommands = [];

              for (const cmd of receivedCommands) {
                if (!cmd || !cmd.action) continue;

                if (cmd.action === 'queue_local_task') {
                  const { task_type, description, path, params } = cmd.params || {};

                  if (taskManager) {
                    let kind = task_type || 'generic_task';
                    if (kind === 'analyze_local_file') {
                      kind = 'analyze_file';
                    }

                    const taskParams = (params && typeof params === 'object') ? { ...params } : {};
                    if (path && !taskParams.path) {
                      taskParams.path = path;
                    }

                    const task = taskManager.createTask({
                      kind,
                      description: description || 'Tarea en segundo plano',
                      params: taskParams,
                      source: 'local',
                    });
                    console.log('[TaskManager] Nueva tarea:', task.id, task.description);

                    try {
                      runBackgroundTask(task, username);
                    } catch (e) {
                      console.error('[TaskManager] Error iniciando ejecución de tarea:', e);
                      taskManager.updateTask(task.id, {
                        status: 'failed',
                        progress: 0,
                        error: String(e),
                      });
                    }
                  } else {
                    console.warn('[TaskManager] queue_local_task recibido pero taskManager no está inicializado');
                  }
                  continue;
                }

                pythonCommands.push(cmd);
              }

              if (pythonCommands.length > 0) {
                console.log(`[ask-ron-stream] Ejecutando ${pythonCommands.length} comando(s) vía Python`);

                try {
                  const pythonScriptsDir = app.isPackaged    
                    ? path.join(app.getPath('userData'), 'python-scripts')    
                    : path.join(process.cwd(), 'python-scripts');

                  const commandsJson = JSON.stringify(pythonCommands)
                    .replace(/\\/g, '\\\\')
                    .replace(/'/g, "\\'");

                  const pythonCode = `\
import sys
import os
import json

sys.path.insert(0, r"${pythonScriptsDir}")
sys.path.insert(0, r"${path.join(pythonScriptsDir, 'core')}")

from core.commands import run_command


commands = json.loads('${commandsJson}')

results = []
for cmd in commands:
    action = cmd.get('action', '')
    params = cmd.get('params', {})
    if action:
        try:
            result = run_command(action, params, {'username': '${username}'})
            ok = result.get('ok', True) if isinstance(result, dict) else True
            msg = None
            err = None

            if isinstance(result, dict):
                msg = result.get('message')
                err = result.get('error')
            if not msg and err:
                msg = err
            if msg is None:
                msg = str(result)

            item = {
                'action': action,
                'ok': ok,
                'message': msg,
            }
            if err:
                item['error'] = err

            results.append(item)
        except Exception as e:
            results.append({
                'action': action,
                'ok': False,
                'error': str(e),
                'message': str(e),
            })


print(json.dumps(results, ensure_ascii=False))
`;

                  await new Promise((resolve) => {    
                    const pythonProcess = spawn('python', ['-u', '-c', pythonCode], {    
                      cwd: pythonScriptsDir,    
                      env: { 
                        ...process.env, 
                        PYTHONIOENCODING: 'utf-8',
                        RON_API_URL: API_URL,
                        RON_AUTH_TOKEN: AUTH_TOKEN || '',
                      },    
                    });    
                      
                    let output = '';    
                    let errorOutput = '';    
                      
                    pythonProcess.stdout.on('data', (data) => {    
                      output += data.toString();    
                    });    
                      
                    pythonProcess.stderr.on('data', (data) => {    
                      errorOutput += data.toString();    
                      console.log('[Python stderr]:', data.toString());    
                    });    
                      
                    pythonProcess.on('close', (code) => {    
                      if (code === 0 && output) {    
                        try {    
                          const results = JSON.parse(output);    
                          console.log('[ask-ron-stream] Resultados:', results);    
                          mainWindow?.webContents.send('command-results', results);    
                          const successCount = results.filter(r => r.ok).length;    
                          console.log(`✅ ${successCount} comando(s) ejecutado(s) exitosamente`);    
                        } catch (e) {    
                          console.error('[ask-ron-stream] Error parseando resultados:', e);    
                        }    
                      } else if (errorOutput) {    
                        console.error('[ask-ron-stream] Python error output:', errorOutput);    
                      }    
                      resolve();    
                    });    
                      
                    pythonProcess.on('error', (err) => {    
                      console.error('[ask-ron-stream] Error ejecutando Python:', err);    
                      resolve();    
                    });    
                  });    
                    
                } catch (e) {    
                  console.error('[ask-ron-stream] Error ejecutando comandos:', e);    
                }    
              }
            }

            mainWindow?.webContents.send('stream-done');
            return { ok: true, streaming: true };
          }

          
          // Formato antiguo: solo chunk sin type
          if (data.chunk && !data.type) {    
            mainWindow?.webContents.send('stream-chunk', data.chunk);    
          }  
    
        } catch (e) {    
          console.warn('SSE JSON parse:', e);    
        }    
      }  
    }  
  
    // Si el stream termina sin un "done" explícito
    mainWindow?.webContents.send('stream-done');  
    return { ok: true, streaming: true };  
  
  } catch (err) {  
    console.error('[ask-ron-stream] error:', err);  
    return await fallbackToNonStream();  
  }  
});



  
// Handler para iniciar Ron 24/7    
safeHandle('start-ron-247', async (_event, userData) => {    
  try {    
    if (ronPythonProcess) {    
      return { success: false, message: 'Ron 24/7 ya está ejecutándose' };    
    }    
    
    console.log('🔄 Descargando/validando scripts Python...');    
    const { baseDir } = await downloadPythonFiles();    
    const pythonScriptPath = path.join(baseDir, 'ron_launcher.py');    
    
    // NUEVO: Determinar ruta de bin/ según si está empaquetado o en desarrollo  
    const binPath = app.isPackaged  
      ? path.join(process.resourcesPath, 'bin')  
      : path.join(process.cwd(), 'bin');  
      
    console.log('[RON] bin path:', binPath);  
    
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
        PATH: `${binPath}${path.delimiter}${process.env.PATH}`,  // NUEVO: agregar bin/ al PATH  
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
safeHandle('stop-ron-247', async () => {  
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
safeHandle('start-manual-recording', async () => {    
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
    
safeHandle('stop-manual-recording', async () => {    
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
safeHandle('get-ron-247-status', async () => {  
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
safeHandle('ron:req', async (_evt, { path: subpath = '/', method = 'GET', headers = {}, body } = {}) => {  
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

  app.whenReady().then(async () => {
    try {
      // 🔹 Descargar/actualizar scripts al inicio (sin necesidad de abrir Ron 24/7)
      await downloadPythonFiles();
    } catch (err) {
      console.warn('⚠️ No se pudieron actualizar los scripts Python al inicio:', err);
      // aquí se usará el fallback local si existe
    }

    createWindow();
  });
}
