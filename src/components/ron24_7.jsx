import React, { useState, useEffect, useRef, useCallback } from 'react';  
import { useAuth } from '../context/authcontext';  
import './ron24_7.css';  
  
const Ron24_7 = () => {  
  const { user } = useAuth();  
  const [isActive, setIsActive] = useState(false);  
  const [status, setStatus] = useState('inactive'); // 'inactive', 'listening', 'conversing'  
  const [logs, setLogs] = useState([]);  
  const [isConnected, setIsConnected] = useState(false);  
  const logsEndRef = useRef(null);  
  
  // Función para añadir logs  
  const addLog = (message, type = 'info') => {  
    const timestamp = new Date().toLocaleTimeString();  
    setLogs(prev => [...prev, {   
      id: Date.now(),   
      message,   
      type,   
      timestamp   
    }]);  
  };  
  
  // Auto-scroll a los logs más recientes  
  useEffect(() => {  
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });  
  }, [logs]);  
  
  // Función para verificar estado con useCallback para evitar dependencias circulares  
  const checkRon247Status = useCallback(async () => {  
    try {  
      const status = await window.electronAPI.getRon247Status();  
      setIsActive(status.isRunning);  
      setStatus(status.status.toLowerCase());  
      setIsConnected(true);  
      addLog(`Estado inicial: ${status.isRunning ? 'Activo' : 'Inactivo'}`, 'success');  
    } catch (error) {  
      console.error('Error checking Ron 24/7 status:', error);  
      setIsConnected(false);  
      addLog('Error al conectar con Ron 24/7', 'error');  
    }  
  }, []);  
  
  // Verificar estado inicial de Ron 24/7  
  useEffect(() => {  
    checkRon247Status();  
  }, [checkRon247Status]);  
  
  const toggleRon247 = async () => {  
    try {  
      if (!user?.username) {  
        addLog('Error: Usuario no autenticado', 'error');  
        return;  
      }  
  
      const result = isActive   
        ? await window.electronAPI.stopRon247()  
        : await window.electronAPI.startRon247({ username: user.username });  
  
      if (result.success) {  
        setIsActive(!isActive);  
        setStatus(!isActive ? 'listening' : 'inactive');  
        addLog(result.message, 'success');  
      } else {  
        addLog(`Error: ${result.message}`, 'error');  
      }  
    } catch (error) {  
      console.error('Error toggling Ron 24/7:', error);  
      addLog('Error al controlar Ron 24/7', 'error');  
    }  
  };  
  
  const clearLogs = () => {  
    setLogs([]);  
    addLog('Logs limpiados', 'info');  
  };  
  
  // Escuchar eventos de Ron 24/7  
  useEffect(() => {  
    if (window.electronAPI) {  
      // Escuchar cambios de estado  
      window.electronAPI.onRon247StatusChange((event, newStatus) => {  
        setStatus(newStatus.toLowerCase());  
        addLog(`Estado cambiado a: ${newStatus}`, 'info');  
      });  
  
      // Escuchar salida de Ron 24/7  
      window.electronAPI.onRon247Output((event, output) => {  
        addLog(`Ron: ${output}`, 'voice');  
      });  
  
      // Cleanup listeners al desmontar  
      return () => {  
        window.electronAPI.removeAllListeners('ron-247-status-changed');  
        window.electronAPI.removeAllListeners('ron-247-output');  
      };  
    }  
  }, []);  
  
  const getStatusColor = () => {  
    switch (status) {  
      case 'active':  
      case 'listening': return '#28a745';  
      case 'conversing': return '#ffc107';  
      case 'inactive': return '#6c757d';  
      default: return '#6c757d';  
    }  
  };  
  
  const getStatusText = () => {  
    switch (status) {  
      case 'active':  
      case 'listening': return 'Escuchando';  
      case 'conversing': return 'Conversando';  
      case 'inactive': return 'Inactivo';  
      default: return 'Desconocido';  
    }  
  };  
  
  return (  
    <div className="ron247-container">  
      <div className="ron247-header">  
        <div className="ron247-title">  
          <h1>🎤 Ron 24/7</h1>  
          <p>Asistente de voz siempre activo</p>  
        </div>  
          
        <div className="ron247-status">  
          <div   
            className="status-indicator"  
            style={{ backgroundColor: getStatusColor() }}  
          />  
          <span className="status-text">{getStatusText()}</span>  
        </div>  
  
        <div className="ron247-controls">  
          <button  
            className={`toggle-button ${isActive ? 'active' : 'inactive'}`}  
            onClick={toggleRon247}  
            disabled={!isConnected}  
          >  
            {isActive ? '🔴 Desactivar' : '🟢 Activar'}  
          </button>  
            
          <button  
            className="clear-button"  
            onClick={clearLogs}  
          >  
            🗑️ Limpiar  
          </button>  
        </div>  
      </div>  
  
      <div className="ron247-info">  
        <div className="info-card">  
          <h3>👤 Usuario Activo</h3>  
          <p>{user?.username || 'No autenticado'}</p>  
        </div>  
          
        <div className="info-card">  
          <h3>🔗 Conexión</h3>  
          <p className={isConnected ? 'connected' : 'disconnected'}>  
            {isConnected ? 'Conectado' : 'Desconectado'}  
          </p>  
        </div>  
          
        <div className="info-card">  
          <h3>💭 Memoria</h3>  
          <p>Compartida con chat de texto</p>  
        </div>  
      </div>  
  
      <div className="ron247-instructions">  
        <h3>📋 Instrucciones de Uso</h3>  
        <ul>  
          <li><strong>Activar:</strong> Haz clic en "Activar" para que Ron comience a escuchar</li>  
          <li><strong>Despertar:</strong> Di "Ron" para iniciar una conversación</li>  
          <li><strong>Comandos:</strong> Usa comandos de voz como "abre YouTube", "diagnostica el sistema"</li>  
          <li><strong>Despedirse:</strong> Di "hasta luego" para terminar la conversación</li>  
          <li><strong>Desactivar:</strong> Haz clic en "Desactivar" para detener completamente</li>  
        </ul>  
      </div>  
  
      <div className="ron247-logs">  
        <div className="logs-header">  
          <h3>📝 Registro de Actividad</h3>  
          <span className="logs-count">{logs.length} eventos</span>  
        </div>  
          
        <div className="logs-container">  
          {logs.length === 0 ? (  
            <div className="no-logs">  
              <p>No hay actividad registrada</p>  
              <p>Activa Ron 24/7 para comenzar</p>  
            </div>  
          ) : (  
            logs.map(log => (  
              <div key={log.id} className={`log-entry ${log.type}`}>  
                <span className="log-time">{log.timestamp}</span>  
                <span className="log-message">{log.message}</span>  
              </div>  
            ))  
          )}  
          <div ref={logsEndRef} />  
        </div>  
      </div>  
    </div>  
  );  
};  
  
export default Ron24_7;