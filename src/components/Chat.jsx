import React, { useState, useEffect, useRef } from 'react';  
import { useAuth } from '../context/AuthContext';  
import { ronAPI } from '../services/api';  
import './Chat.css';  
  
const Chat = () => {  
  const [messages, setMessages] = useState([]);  
  const [inputText, setInputText] = useState('');  
  const [loading, setLoading] = useState(false);  
  const [error, setError] = useState('');  
  const messagesEndRef = useRef(null);  
    
  const { user, token, logout } = useAuth();  
  
  // Auto-scroll al final de los mensajes  
  const scrollToBottom = () => {  
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });  
  };  
  
  useEffect(() => {  
    scrollToBottom();  
  }, [messages]);  
  
  // Cargar historial de conversaciones al montar el componente  
  useEffect(() => {  
    const loadConversations = async () => {  
      try {  
        const response = await ronAPI.getUserConversations(token);  
        const conversations = response.conversations || [];  
          
        // Convertir el formato del backend al formato del chat  
        const formattedMessages = conversations.map((conv, index) => [  
          {  
            id: `user-${index}`,  
            text: conv.user,  
            sender: 'user',  
            timestamp: conv.timestamp  
          },  
          {  
            id: `ron-${index}`,  
            text: conv.ron,  
            sender: 'ron',  
            timestamp: conv.timestamp  
          }  
        ]).flat();  
          
        setMessages(formattedMessages);  
      } catch (error) {  
        console.error('Error cargando conversaciones:', error);  
      }  
    };  
  
    if (token) {  
      loadConversations();  
    }  
  }, [token]);  
  
  const handleSubmit = async (e) => {  
    e.preventDefault();  
    if (!inputText.trim() || loading) return;  
  
    const userMessage = {  
      id: `user-${Date.now()}`,  
      text: inputText,  
      sender: 'user',  
      timestamp: new Date().toISOString()  
    };  
  
    setMessages(prev => [...prev, userMessage]);  
    setInputText('');  
    setLoading(true);  
    setError('');  
  
    try {  
      const response = await ronAPI.chatWithRon(inputText, token);  
        
      if (response.error) {  
        setError(response.error);  
        return;  
      }  
  
      const ronMessage = {  
        id: `ron-${Date.now()}`,  
        text: response.ron,  
        sender: 'ron',  
        timestamp: new Date().toISOString()  
      };  
  
      setMessages(prev => [...prev, ronMessage]);  
  
      // Si Ron indica shutdown, mostrar mensaje de despedida  
      if (response.shutdown) {  
        setTimeout(() => {  
          logout();  
        }, 2000);  
      }  
  
    } catch (error) {  
      setError('Error al comunicarse con Ron. Intenta de nuevo.');  
      console.error('Error:', error);  
    } finally {  
      setLoading(false);  
    }  
  };  
  
  const handleKeyPress = (e) => {  
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
      <div className="chat-header">  
        <div className="chat-title">  
          <h1>🤖 Ron Assistant</h1>  
          <span className="user-info">Hola, {user?.username}</span>  
        </div>  
        <div className="chat-actions">  
          <button onClick={clearChat} className="clear-button">  
            🗑️ Limpiar  
          </button>  
          <button onClick={logout} className="logout-button">  
            🚪 Salir  
          </button>  
        </div>  
      </div>  
  
      <div className="messages-container">  
        {messages.length === 0 ? (  
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
                <div className="message-text">{message.text}</div>  
                <div className="message-time">  
                  {new Date(message.timestamp).toLocaleTimeString()}  
                </div>  
              </div>  
            </div>  
          ))  
        )}  
          
        {loading && (  
          <div className="message ron-message">  
            <div className="message-content">  
              <div className="typing-indicator">  
                <span></span>  
                <span></span>  
                <span></span>  
              </div>  
            </div>  
          </div>  
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
            onKeyPress={handleKeyPress}  
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