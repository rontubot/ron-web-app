// src/components/chat.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/authcontext';
import { ronAPI } from '../services/api';
import './chat.css';

// Limpia líneas de log para mostrar solo el contenido útil
const sanitizeRonText = (raw = '') => {
  if (!raw || typeof raw !== 'string') return '';
  const lines = raw.split(/\r?\n/).map(l => l.trim());

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
    return last || raw;
  }
  return content.join('\n').trim();
};

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const { token, logout } = useAuth();

  // Actualiza SOLO la burbuja del bot indicada
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

  // Fallback: traer último ron desde historial
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

  // Scroll al final
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => { scrollToBottom(); }, [messages]);

  // Cargar historial inicial
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const response = await ronAPI.getUserConversations(token);
        const conversations = response.conversations || [];
        const formatted = conversations
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

  // Enviar mensaje
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || loading) return;

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
      let ronText = '';

      // Preferir Electron si existe
      if (window?.electronAPI?.askRon) {
        const res = await window.electronAPI.askRon({ text });
        if (res?.ok) {
          const raw = typeof res.text === 'string'
            ? res.text
            : (res?.ron ?? res?.reply ?? res?.user_response ?? res?.message ?? JSON.stringify(res.text ?? ''));
          ronText = sanitizeRonText(raw);
        } else {
          const httpRes = await ronAPI.chatWithRon(text, token);
          if (httpRes?.error) throw new Error(httpRes.error);
          ronText = sanitizeRonText(
            typeof httpRes === 'string'
              ? httpRes
              : (httpRes?.reply ?? httpRes?.ron ?? httpRes?.user_response ?? httpRes?.message ?? '')
          );
        }
      } else {
        // Solo backend HTTP
        const httpRes = await ronAPI.chatWithRon(text, token);
        if (httpRes?.error) throw new Error(httpRes.error);
        ronText = sanitizeRonText(
          typeof httpRes === 'string'
            ? httpRes
            : (httpRes?.reply ?? httpRes?.ron ?? httpRes?.user_response ?? httpRes?.message ?? '')
        );
      }

      const cleaned = sanitizeRonText(ronText);
      updateBotBubble(botId, cleaned);

      // Fallback si quedó vacío
      if (!cleaned || !cleaned.trim()) {
        await new Promise(r => setTimeout(r, 250));
        const fromHist1 = await fetchLastRonFromHistory();
        if (fromHist1 && fromHist1.trim()) {
          updateBotBubble(botId, fromHist1);
        } else {
          await new Promise(r => setTimeout(r, 400));
          const fromHist2 = await fetchLastRonFromHistory();
          updateBotBubble(botId, fromHist2);
        }
      }
    } catch (err) {
      console.error('Error:', err);
      const msg = String(err?.message || '');
      if (msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('token')) {
        // token inválido/expirado -> cerrar sesión
        logout?.();
      }
      updateBotBubble(botId, '', { error: true });
      setError('Error al comunicarse con Ron. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Enviar con Enter (sin Shift)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError('');
  };

  return (
    <div className="chat-container">
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
                    <div className="typing-indicator"><span></span><span></span><span></span></div>
                  ) : message.error ? (
                    'Sin respuesta'
                  ) : (
                    message.text
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

      <div className="chat-actions-inline">
        <button onClick={clearChat} className="clear-button">
          🗑️ Limpiar Chat
        </button>
      </div>

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
    </div>
  );
};

export default Chat;
