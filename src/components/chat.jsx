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
    
  let text = raw.replace(/\\n/g, '\n');    

  // Quitar cualquier blob JSON que tenga user_response/commands,
  // aunque tenga saltos de línea o espacios raros
  text = text.replace(/\{"user_response"[\s\S]*?"commands":\[[\s\S]*?\]\}/g, '');    
  text = text.replace(/\{"action"[\s\S]*?"params":\{[\s\S]*?\}\}/g, '');    
   
    
  const lines = text.split(/\r?\n/).map(l => l.trim());    
    
  const isLog = (l) =>    
    !l ||    
    l.startsWith('📁') ||    
    l.startsWith('[RON]') ||    
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
  return content.join('\n').trim();    
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
    
  // MODIFICADO: Deduplicar conversaciones al cargar  
  useEffect(() => {    
    const loadConversations = async () => {    
      try {    
        const response = await ronAPI.getUserConversations(token);    
        const conversations = response.conversations || [];    
          
        // NUEVO: Deduplicar por contenido + timestamp cercano (dentro de 5 segundos)  
        const deduplicated = [];  
        const seen = new Map(); // key: "user|ron", value: timestamp  
          
        for (const conv of conversations) {  
          const key = `${conv.user}|${conv.ron}`;  
          const timestamp = new Date(conv.timestamp).getTime();  
            
          // Verificar si ya vimos este par recientemente (dentro de 5 segundos)  
          if (seen.has(key)) {  
            const lastTimestamp = seen.get(key);  
            if (Math.abs(timestamp - lastTimestamp) < 5000) {  
              // Es un duplicado reciente, saltarlo  
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
    
  // 🔹 Escuchar cuando una tarea de fondo termina y mandar el resumen al chat
  useEffect(() => {
    if (!window?.electronAPI?.onTaskCompletedMessage) return;

    const unsubscribe = window.electronAPI.onTaskCompletedMessage(
      ({ id, action, summary }) => {
        if (!summary) return;

        const text = sanitizeRonText(summary);

        const taskMessage = {
          id: `task-${id}-${Date.now()}`,
          text,
          sender: 'ron',
          timestamp: new Date().toISOString(),
        };

        // Añadimos el mensaje de Ron al final del chat
        setMessages((prev) => [...prev, taskMessage]);
      }
    );

    // cleanup al desmontar
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
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
      <div className="chat-top-bar" style={{ 
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '4px 8px'
      }}>
        <button
          type="button"
          className="task-center-toggle"
          onClick={() => setShowTasks((v) => !v)}
          style={{
            fontSize: '0.85rem',
            borderRadius: '999px',
            padding: '4px 10px',
            border: '1px solid #444',
            background: '#1b1b1b',
            color: '#f5f5f5',
            cursor: 'pointer'
          }}
        >
          📋 Tareas
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