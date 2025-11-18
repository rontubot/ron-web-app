// src/components/chat.jsx    
import React, { useState, useEffect, useRef } from 'react';    
import { useAuth } from '../context/authcontext';    
import { ronAPI } from '../services/api';    
import './chat.css';    
import { TaskCenter } from './TaskCenter';

    
const sanitizeRonText = (raw = '') => {    
  if (!raw || typeof raw !== 'string') return '';    
    
  try {    
    const trimmed = raw.trim();    
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {    
      const parsed = JSON.parse(trimmed);    
      if (parsed && typeof parsed === 'object') {    
        const candidate =    
          (typeof parsed.user_response === 'string' && parsed.user_response.trim()) ||    
          (typeof parsed.reply === 'string' && parsed.reply.trim()) ||    
          (typeof parsed.message === 'string' && parsed.message.trim());    
    
        if (candidate) return candidate.trim();    
      }    
    }    
  } catch (e) {}    
    
  // Normalizar saltos de línea escapados
  let text = raw.replace(/\\n/g, '\n');    

  // Quitar cualquier blob JSON que tenga user_response/commands,
  // aunque tenga saltos de línea o espacios raros
  text = text.replace(/\{"user_response"[\s\S]*?"commands":\[[\s\S]*?\]\}/g, '');    
  text = text.replace(/\{"action"[\s\S]*?"params":\{[\s\S]*?\}\}/g, '');    
    
  const lines = text.split(/\r?\n/).map(l => l.trim());    
    
  const isLog = (l) =>
    !l ||
    l.startsWith('📁') ||
    l.startsWith('📂') ||
    l.startsWith('📊') ||
    l.startsWith('✅') ||
    l.startsWith('🔊') ||
    l.startsWith('🔉') ||
    l.startsWith('🔄') ||
    l.startsWith('🧹') ||
    l.startsWith('💿') ||
    l.startsWith('🌐') ||
    // Errores técnicos típicos de comandos de archivos
    l.startsWith('⚠️ El archivo no existe:') ||
    l.startsWith('⚠️ La ruta no es un archivo:') ||
    l.startsWith('⚠️ La ruta no es un directorio válido:') ||
    l.startsWith('⚠️ Directorio vacío') ||
    l.toLowerCase().startsWith('info:') ||
    l.toLowerCase().startsWith('debug:') ||
    l.toLowerCase().includes('archivo de memoria no encontrado') ||
    l.toLowerCase().includes('descargando') ||
    l.toLowerCase().includes('control server') ||
    l.toLowerCase().includes('ron 24/7') ||
    /^http(s)?:\/\//i.test(l);

  const content = lines.filter(l => !isLog(l));    

  if (content.length === 0) {    
    const last = [...lines].reverse().find(l => l && !isLog(l));    
    return last || '';    
  }    

  // 🔹 AQUÍ normalizamos ANTES de devolver
  let cleaned = content.join('\n').trim();

  // Cambiar "; " por ". " cuando parece final de frase (antes de mayúscula/número)
  cleaned = cleaned.replace(/;\s+(?=[A-ZÁÉÍÓÚÑ0-9])/g, '. ');

  // Opcional: si hay ";" pegado a texto, meter un espacio
  cleaned = cleaned.replace(/;(?=\S)/g, '; ');

  return cleaned;    
};
   
    
const Chat = () => {    
  const [messages, setMessages] = useState([]);    
  const [inputText, setInputText] = useState('');    
  const [loading, setLoading] = useState(false);    
  const [error, setError] = useState('');    
  const messagesEndRef = useRef(null);    
  const isSubmittingRef = useRef(false);    
  const lastSubmitTimeRef = useRef(0); 
  const [showTasks, setShowTasks] = useState(false);
  const [hasActiveTasks, setHasActiveTasks] = useState(false); 
    
  const { token, logout } = useAuth();    
    
  const updateBotBubble = (botId, text, opts = {}) => {    
    setMessages(prev =>    
      prev.map(m => {    
        if (m.id !== botId) return m;    
        if (opts.error) {    
          return { ...m, text: 'Error al comunicarse con Ron. Intenta de nuevo.', pending: false, error: true };    
        }    
        if (typeof text === 'string' && text.trim() !== '') {    
          return { ...m, text, pending: false, error: false };    
        }    
        return { ...m, pending: true };    
      })    
    );    
  };    
    
  const fetchLastRonFromHistory = async () => {    
    try {    
      const response = await ronAPI.getUserConversations(token);    
      const conversations = response.conversations || [];    
      if (!conversations.length) return '';    
      const last = conversations[conversations.length - 1];    
      return sanitizeRonText(last?.ron || '');    
    } catch (e) {    
      console.error('fallback history error', e);    
      return '';    
    }    
  };    
    
  const scrollToBottom = () => {    
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });    
  };    
  useEffect(() => { scrollToBottom(); }, [messages]);    
   

  const isSystemToolPrompt = (txt = '') => {
    if (typeof txt !== 'string') return false;
    const t = txt.trim();
    if (!t) return false;

    // Prompts internos del analizador de archivos
    if (t.startsWith('Quiero que actúes como un experto en revisión de código')) return true;
    if (t.includes('=== METADATOS DEL ARCHIVO ===')) return true;
    if (t.includes('=== VISTA PREVIA DEL ARCHIVO ===')) return true;
    if (t.includes('Análisis automático y vista previa del archivo:')) return true;

    return false;
  };

  useEffect(() => {
    const loadConversations = async () => {
      try {
        const response = await ronAPI.getUserConversations(token);
        const conversations = response.conversations || [];

        const deduplicated = [];
        const seen = new Map(); // key: "user|ron", value: timestamp

        for (const conv of conversations) {
          // ⛔️ Saltar prompts internos de herramientas
          if (isSystemToolPrompt(conv.user)) {
            continue;
          }

          const key = `${conv.user}|${conv.ron}`;
          const timestamp = new Date(conv.timestamp).getTime();

          if (seen.has(key)) {
            const lastTimestamp = seen.get(key);
            if (Math.abs(timestamp - lastTimestamp) < 5000) {
              continue;
            }
          }

          seen.set(key, timestamp);
          deduplicated.push(conv);
        }

        const formatted = deduplicated
          .map((conv, index) => ([
            {
              id: `user-${index}-${conv.timestamp || Date.now()}`,
              text: conv.user,
              sender: 'user',
              timestamp: conv.timestamp,
            },
            {
              id: `ron-${index}-${conv.timestamp || Date.now()}`,
              text: sanitizeRonText(conv.ron),
              sender: 'ron',
              timestamp: conv.timestamp,
            }
          ]))
          .flat();

        setMessages(formatted);
      } catch (err) {
        console.error('Error cargando conversaciones:', err);
        setError('No se pudo cargar el historial de chat.');
      }
    };

    if (token) loadConversations();
  }, [token]);

    
// 🔹 Un solo useEffect para tareas de fondo + resultados de comandos (incluye recordatorios)
useEffect(() => {
  const api = window.electronAPI;
  if (!api) return;

  // Helper para añadir mensajes de Ron evitando duplicados por texto
  const pushRonMessage = (text, meta = {}) => {
    if (!text || typeof text !== 'string') return;

    const cleaned = sanitizeRonText(text);

    setMessages((prev) => {
      const alreadyExists = prev.some((m) => {
        if (m.sender !== 'ron') return false;
        if (m.text !== cleaned) return false;

        // Si viene con taskId/commandAction/source, miramos que coincidan también
        if (meta.taskId && m.taskId && m.taskId !== meta.taskId) return false;
        if (meta.commandAction && m.commandAction && m.commandAction !== meta.commandAction) return false;
        if (meta.source && m.source && m.source !== meta.source) return false;

        return true;
      });

      if (alreadyExists) return prev;

      return [
        ...prev,
        {
          id: `ron-${Date.now()}-${Math.random()}`,
          text: cleaned,
          sender: 'ron',
          timestamp: new Date().toISOString(),
          ...meta,
        },
      ];
    });
  };

  // 👉 1) Cuando una tarea de fondo termina (análisis de archivo, recordatorios, etc.)
  const offTask = api.onTaskCompletedMessage?.((data) => {
    if (!data) return;
    const { id, action, ok, summary, error, description, params } = data;

    let text = '';

    // 🔍 Analizador de archivos
    if (action === 'analyze_local_file' || action === 'analyze_file') {
      if (ok && summary) {
        text = summary;
      } else if (!ok && error) {
        text = `⚠️ No pude completar la tarea de análisis:\n${error}`;
      }
    }

    // ⏰ Recordatorios (reminder_timer)
    else if (action === 'reminder_timer') {
      if (ok) {
        // Intentar sacar el título del recordatorio
        const p = params || {};
        let reminderTitle =
          p.reminder_title ||
          p.title ||
          p.name ||
          p.text ||
          '';

        // Si no viene título claro, intentar extraerlo de la descripción:
        // p.ej: "Recordatorio en 1 minuto: mandar el informe"
        if (!reminderTitle && typeof description === 'string') {
          const idx = description.indexOf(':');
          if (idx !== -1) {
            reminderTitle = description.slice(idx + 1).trim();
          }
        }

        // Último fallback: limpiar el "tu recordatorio" del summary
        if (!reminderTitle && typeof summary === 'string') {
          reminderTitle = summary.replace('⏰ Te recuerdo:', '')
                                 .replace('tu recordatorio', '')
                                 .trim();
        }

        if (!reminderTitle) {
          reminderTitle = 'tu recordatorio';
        }

        text = `⏰ Te recuerdo: ${reminderTitle}`;
      } else if (!ok && error) {
        text = `⚠️ Hubo un problema con el recordatorio:\n${error}`;
      }
    }

    // Otros tipos de tareas -> de momento los ignoramos para no llenar el chat
    else {
      return;
    }

    if (!text) return;

    pushRonMessage(text, {
      source: 'task',
      taskId: id,
      taskAction: action,
    });
  });

  // 👉 2) Resultados de comandos locales (list_files, read_file, copy_file, etc.)
  const offCmd = api.onCommandResults?.((results) => {
    if (!Array.isArray(results)) return;

    results.forEach((res) => {
      const { action, ok, message, error } = res || {};
      let text = '';

      if (ok && message) {
        text = String(message);
      } else if (!ok && error) {
        text = `⚠️ ${error}`;
      } else {
        return;
      }

      pushRonMessage(text, {
        source: 'command',
        commandAction: action,
      });
    });
  });

  // Cleanup de ambos listeners
  return () => {
    if (typeof offTask === 'function') offTask();
    if (typeof offCmd === 'function') offCmd();
  };
}, []);




  // 🔔 NUEVO: efecto para detectar si hay tareas activas (queued/running)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    let cancelled = false;
    let unsubscribe = null;

    const refreshTasks = async () => {
      try {
        const list = (await api.listTasks?.()) || [];
        if (cancelled) return;

        const active = list.some(
          (t) => t.status === 'running' || t.status === 'queued'
        );
        setHasActiveTasks(active);
      } catch (e) {
        console.error('Error cargando tareas:', e);
      }
    };

    // Carga inicial
    refreshTasks();

    // Suscribirse a cambios
    if (api.onTaskUpdated) {
      unsubscribe = api.onTaskUpdated((_task) => {
        refreshTasks();
      });
    }

    return () => {
      cancelled = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);


  const handleSubmit = async (e) => {    
    if (e && typeof e.preventDefault === 'function') {    
      e.preventDefault();    
    }    
    
    const now = Date.now();    
    if (now - lastSubmitTimeRef.current < 1000) {    
      console.log('Submit bloqueado: muy rápido');    
      return;    
    }    
    
    if (isSubmittingRef.current || !inputText.trim() || loading) return;    
        
    isSubmittingRef.current = true;    
    lastSubmitTimeRef.current = now;  
    
    const text = inputText.trim();    
    const userMessage = {    
      id: `user-${crypto.randomUUID?.() || Date.now()}`,    
      text,    
      sender: 'user',    
      timestamp: new Date().toISOString(),    
    };    
    setMessages(prev => [...prev, userMessage]);    
    
    setInputText('');    
    setLoading(true);    
    setError('');    
    
    const botId = `bot-${crypto.randomUUID?.() || Date.now()}`;    
    setMessages(prev => [    
      ...prev,    
      { id: botId, text: '', sender: 'ron', pending: true, timestamp: new Date().toISOString() }    
    ]);    
    
    try {    
      let streamingSupported = false;    
    
      if (window?.electronAPI?.askRonStream && window?.electronAPI?.onStreamChunk) {    
        streamingSupported = true;    
        let accumulatedText = '';    
    
        const cleanupChunk = window.electronAPI.onStreamChunk((chunk) => {    
          accumulatedText += chunk;    
          updateBotBubble(botId, accumulatedText);    
        });    
    
        const cleanupDone = window.electronAPI.onStreamDone(() => {    
          setLoading(false);    
          isSubmittingRef.current = false;    
          cleanupChunk();    
          cleanupDone();    
          cleanupError();    
        });    
    
        const cleanupError = window.electronAPI.onStreamError((error) => {    
          console.error('Stream error:', error);    
          updateBotBubble(botId, '', { error: true });    
          setError('Error al comunicarse con Ron. Intenta de nuevo.');    
          setLoading(false);    
          isSubmittingRef.current = false;    
          cleanupChunk();    
          cleanupDone();    
          cleanupError();    
        });    
    
        const res = await window.electronAPI.askRonStream({ text });    
    
        if (!res?.ok) {    
          streamingSupported = false;    
          cleanupChunk();    
          cleanupDone();    
          cleanupError();    
        }    
      }    
    
      if (!streamingSupported) {
        let ronText = '';

        // ⚙️ 1) Intento vía Electron (modo app de escritorio)
        if (window?.electronAPI?.askRon) {
          const res = await window.electronAPI.askRon({ text });

          if (res?.ok) {
            // La API de Electron debería reenviarnos lo mismo que el proxy:
            // { user_response, ron, commands, shutdown, ... }
            const raw =
              res.user_response ??
              res.ron ??
              (typeof res.text === 'string' ? res.text : '') ??
              '';

            ronText = sanitizeRonText(raw);
          } else {
            // Fallback HTTP si Electron falla
            const httpRes = await ronAPI.chatWithRon(text, token);
            if (httpRes?.error) throw new Error(httpRes.error);

            const raw =
              typeof httpRes === 'string'
                ? httpRes
                : (httpRes.user_response ??
                   httpRes.ron ??
                   httpRes.reply ??
                   httpRes.message ??
                   '');

            ronText = sanitizeRonText(raw);
          }
        } else {
          // ⚙️ 2) Modo web puro: siempre vía HTTP
          const httpRes = await ronAPI.chatWithRon(text, token);
          if (httpRes?.error) throw new Error(httpRes.error);

          const raw =
            typeof httpRes === 'string'
              ? httpRes
              : (httpRes.user_response ??
                 httpRes.ron ??
                 httpRes.reply ??
                 httpRes.message ??
                 '');

          ronText = sanitizeRonText(raw);
        }

        // Ya viene sanitizado una sola vez
        const cleaned = ronText || '';

        updateBotBubble(botId, cleaned || '');    

        // Ya no necesitamos hacer trucos con historial:
        // el backend ahora siempre devuelve un user_response coherente.
        setLoading(false);
        isSubmittingRef.current = false;
      }


    } catch (err) {    
      console.error('Error:', err);    
      const msg = String(err?.message || '');    
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('token')) {    
        logout?.();    
      }    
      updateBotBubble(botId, '', { error: true });    
      setError('Error al comunicarse con Ron. Intenta de nuevo.');    
      setLoading(false);    
      isSubmittingRef.current = false;    
    }    
  };    
    
  const handleKeyDown = (e) => {     
    if (e.key === 'Enter' && !e.shiftKey) {    
      e.preventDefault();    
      e.stopPropagation();  
      if (!inputText.trim() || loading || isSubmittingRef.current) return;    
          
      const now = Date.now();    
      if (now - lastSubmitTimeRef.current >= 1000) {    
        e.currentTarget.form?.requestSubmit();    
      }    
    }    
  };    
    
  return (    
    <div className="chat-container">    
      {/* Barra superior con botón de tareas */}
      <div
        className="chat-top-bar"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '4px 8px',
        }}
      >
        <button
          type="button"
          className={
            'task-center-toggle ' +
            (hasActiveTasks ? 'task-center-toggle--active' : '')
          }
          onClick={() => setShowTasks((v) => !v)}
        >
          📋 Tareas{hasActiveTasks ? ' •' : ''}
        </button>
      </div>

      <div className="messages-container">    
        {messages.length === 0 && !loading && !error ? (    
          <div className="welcome-message">    
            <h2>¡Hola! Soy Ron 🤖</h2>    
            <p>¿En qué puedo ayudarte hoy?</p>    
          </div>    
        ) : (    
          messages.map((message) => (    
            <div    
              key={message.id}    
              className={`message ${message.sender === 'user' ? 'user-message' : 'ron-message'}`}    
            >    
              <div className="message-content">    
                <div className="message-text">    
                  {message.pending ? (    
                    <div className="typing-indicator">    
                      <span></span><span></span><span></span>    
                    </div>    
                  ) : message.error ? (    
                    'Sin respuesta'    
                  ) : (    
                    <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>    
                  )}    
                </div>    
                <div className="message-time">    
                  {(() => {    
                    const t = message.timestamp ? new Date(message.timestamp) : new Date();    
                    return isNaN(t.getTime()) ? '' : t.toLocaleTimeString();    
                  })()}    
                </div>    
              </div>    
            </div>    
          ))    
        )}    
        <div ref={messagesEndRef} />    
      </div>    
    
      {error && (    
        <div className="error-banner">    
          {error}    
          <button onClick={() => setError('')} className="error-close">×</button>    
        </div>    
      )}    
    
      <form onSubmit={handleSubmit} className="chat-input-form">    
        <div className="input-container">    
          <textarea    
            value={inputText}    
            onChange={(e) => setInputText(e.target.value)}    
            onKeyDown={handleKeyDown}    
            placeholder="Escribe tu mensaje aquí..."    
            className="chat-input"    
            rows="1"    
            disabled={loading}    
          />    
          <button    
            type="submit"    
            disabled={loading || !inputText.trim()}    
            className="send-button"    
          >    
            {loading ? '⏳' : '📤'}    
          </button>    
        </div>    
      </form> 
      {/* Panel de tareas en segundo plano */}
      <TaskCenter open={showTasks} onClose={() => setShowTasks(false)} />
    </div>  
  );  
};  
  
export default Chat;