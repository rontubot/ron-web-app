import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/authcontext';
import { ronAPI } from '../services/api';
import './chat.css';

// Quita líneas de log y devuelve solo el contenido "humano"
const sanitizeRonText = (raw = '') => {
  if (!raw || typeof raw !== 'string') return '';

  // Cortamos por líneas, quitamos espacios
  const lines = raw.split(/\r?\n/).map(l => l.trim());

  // Filtros de líneas de log típicas
  const isLog = (l) => (
    !l ||                            // vacía
    l.startsWith('📁') ||            // "📁 Archivo de memoria..."
    l.startsWith('[RON]') ||
    l.toLowerCase().startsWith('info:') ||
    l.toLowerCase().startsWith('debug:') ||
    l.toLowerCase().includes('archivo de memoria no encontrado') ||
    l.toLowerCase().includes('descargando') ||
    l.toLowerCase().includes('control server') ||
    l.toLowerCase().includes('ron 24/7') || 
    /^http(s)?:\/\//i.test(l)       // URLs de log/descarga, por si acaso
  );

  // Nos quedamos con las líneas que no parecen log
  const content = lines.filter(l => !isLog(l));

  // Si no queda nada, nos quedamos con la última línea no vacía del original
  if (content.length === 0) {
    const last = lines.reverse().find(l => l && !isLog(l));
    return last || raw;
  }

  // Devuelve el texto “limpio”
  return content.join('\n').trim();
};


const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const { token, logout } = useAuth();

  // Actualiza SOLO la burbuja del bot indicada.
  // - Si text es vacío, NO pisa: deja la burbuja en pending.
  // - Si opts.error es true, marca error y quita pending.
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
        // vacío: mantener pending (typing) y no pisar
        return { ...m, pending: true };
      })
    );
  };

  // Fallback: trae el último mensaje de Ron desde el historial persistido
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

  // helper: scroll al final
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // cargar historial inicial
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const response = await ronAPI.getUserConversations(token);
        const conversations = response.conversations || [];

        // Intercalar user/ron y aplanar
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

  // enviar mensaje
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || loading) return;

    const text = inputText.trim();

    // agregar mensaje del usuario
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

    // crea burbuja pendiente del bot
    const botId = `bot-${crypto.randomUUID?.() || Date.now()}`;
    setMessages(prev => [
      ...prev,
      { id: botId, text: '', sender: 'ron', pending: true, timestamp: new Date().toISOString() }
    ]);

    try {
      let ronText = '';

      // Preferir Electron si está
      if (window?.electronAPI?.askRon) {
        const res = await window.electronAPI.askRon({ text });
        if (res?.ok) {
          const raw = typeof res.text === 'string'
            ? res.text
            : (res?.ron ?? res?.reply ?? res?.user_response ?? res?.message ?? JSON.stringify(res.text ?? ''));
          ronText = sanitizeRonText(raw);
        } else {
          // fallback HTTP
          const httpRes = await ronAPI.chatWithRon(text, token);
          if (httpRes?.error) throw new Error(httpRes.error);
          ronText = sanitizeRonText(
            typeof httpRes === 'string'
              ? httpRes
              : (httpRes?.ron ?? httpRes?.reply ?? httpRes?.user_response ?? httpRes?.message ?? '')
          );
          if (httpRes?.shutdown) setTimeout(() => logout(), 2000);
        }
      } else {
        // Solo backend HTTP
        const httpRes = await ronAPI.chatWithRon(text, token);
        if (httpRes?.error) throw new Error(httpRes.error);
        ronText = sanitizeRonText(
          typeof httpRes === 'string'
            ? httpRes
            : (httpRes?.ron ?? httpRes?.reply ?? httpRes?.user_response ?? httpRes?.message ?? '')
        );
        if (httpRes?.shutdown) setTimeout(() => logout(), 2000);
      }

      // 1) intentar actualizar con lo recibido (sin pisar con vacío)
      const cleaned = sanitizeRonText(ronText);
      updateBotBubble(botId, cleaned);

      // 2) si quedó vacío, hacer fallback al historial (1 o 2 reintentos cortos)
      if (!cleaned || !cleaned.trim()) {
        await new Promise(r => setTimeout(r, 250));
        const fromHist1 = await fetchLastRonFromHistory();
        if (fromHist1 && fromHist1.trim()) {
          updateBotBubble(botId, fromHist1);
        } else {
          await new Promise(r => setTimeout(r, 400));
          const fromHist2 = await fetchLastRonFromHistory();
          updateBotBubble(botId, fromHist2); // si sigue vacío, se mantiene pending
        }
      }
    } catch (err) {
      console.error('Error:', err);
      updateBotBubble(botId, '', { error: true }); // marca SOLO esa burbuja
      setError('Error al comunicarse con Ron. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // enviar con Enter (sin Shift)
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
