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
  const [isRecording, setIsRecording] = useState(false);  
  const [recordingStatus, setRecordingStatus] = useState('idle'); // 'idle', 'recording', 'processing'
  const [audioContext, setAudioContext] = useState(null);  
  const [analyser, setAnalyser] = useState(null);  
  const [mediaStream, setMediaStream] = useState(null);  
  const [animationId, setAnimationId] = useState(null);  
  const canvasRef = useRef(null);     
    
 
  const getStatusColor = () => {
  switch ((status || '').toLowerCase()) {
    case 'active':
    case 'listening':
      return '#28a745';   // verde
    case 'conversing':
      return '#ffc107';   // amarillo
    case 'inactive':
    default:
      return '#6c757d';   // gris
  }
};


 
  // Función para configurar el análisis de audio  
  const setupAudioAnalysis = async () => {  
    try {  
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });  
      const context = new (window.AudioContext || window.webkitAudioContext)();  
      const source = context.createMediaStreamSource(stream);  
      const analyserNode = context.createAnalyser();  
        
      analyserNode.fftSize = 256;  
      source.connect(analyserNode);  
        
      setAudioContext(context);  
      setAnalyser(analyserNode);  
      setMediaStream(stream);  
        
      return { context, analyserNode, stream };  
    } catch (error) {  
      console.error('Error accessing microphone:', error);  
      addLog('Error al acceder al micrófono para visualización', 'error');  
      return null;  
    }  
  };

  // Función para dibujar el espectro de audio  
  const drawSpectrum = (analyserNode, canvas) => {  
    const ctx = canvas.getContext('2d');  
    const bufferLength = analyserNode.frequencyBinCount;  
    const dataArray = new Uint8Array(bufferLength);  
      
    const draw = () => {  
      if (!analyserNode || recordingStatus !== 'recording') return;  
        
      analyserNode.getByteFrequencyData(dataArray);  
        
      ctx.clearRect(0, 0, canvas.width, canvas.height);  
        
      const barWidth = canvas.width / bufferLength;  
      let x = 0;  
        
      for (let i = 0; i < bufferLength; i++) {  
        const barHeight = (dataArray[i] / 255) * canvas.height;  
          
        // Gradiente de color basado en la frecuencia  
        const hue = (i / bufferLength) * 360;  
        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;  
          
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);  
        x += barWidth;  
      }  
        
      const id = requestAnimationFrame(draw);  
      setAnimationId(id);  
    };  
      
    draw();  
  };



  // Función modificada para iniciar grabación manual  
  const startManualRecording = async () => {  
    try {  
      setRecordingStatus('recording');  
      setIsRecording(true);  
        
      // Configurar análisis de audio  
      const audioSetup = await setupAudioAnalysis();  
      if (audioSetup && canvasRef.current) {  
        drawSpectrum(audioSetup.analyserNode, canvasRef.current);  
      }  
        
      const result = await window.electronAPI.startManualRecording();  
      if (result.success) {  
        addLog('Grabación manual iniciada', 'success');  
      } else {  
        addLog(`Error: ${result.message}`, 'error');  
        setIsRecording(false);  
        setRecordingStatus('idle');  
        cleanupAudio();  
      }  
    } catch (error) {  
      addLog('Error al iniciar grabación manual', 'error');  
      setIsRecording(false);  
      setRecordingStatus('idle');  
      cleanupAudio();  
    }  
  };  

  // Función para limpiar recursos de audio  
  const cleanupAudio = () => {  
    if (animationId) {  
      cancelAnimationFrame(animationId);  
      setAnimationId(null);  
    }  
    if (mediaStream) {  
      mediaStream.getTracks().forEach(track => track.stop());  
      setMediaStream(null);  
    }  
    if (audioContext) {  
      audioContext.close();  
      setAudioContext(null);  
    }  
    setAnalyser(null);  
  };


  // Cleanup cuando el componente se desmonte  
  useEffect(() => {  
    return () => {  
      cleanupAudio();  
    };  
  }, []);



  // Función modificada para detener grabación manual  
  const stopManualRecording = async () => {  
    try {  
      setRecordingStatus('processing');  
      cleanupAudio();  
        
      const result = await window.electronAPI.stopManualRecording();  
      if (result.success) {  
        addLog('Grabación manual procesada', 'success');  
      } else {  
        addLog(`Error: ${result.message}`, 'error');  
      }  
    } catch (error) {  
      addLog('Error al procesar grabación manual', 'error');  
    } finally {  
      setIsRecording(false);  
      setRecordingStatus('idle');  
    }  
  };
  
  // Función para manejar click del botón  
  const handleRecordingToggle = () => {  
    if (isRecording) {  
      stopManualRecording();  
    } else {  
      startManualRecording();  
    }  
  };



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
    
  // Función para controlar solo la escucha (NUEVA)  
  const toggleListening = async () => {    
    try {    
      const result = await window.electronAPI.toggleRon247Listening();    
      if (result.success) {    
        setStatus(result.status);    
        addLog(result.message, 'success');    
      } else {    
        addLog(`Error: ${result.message}`, 'error');    
      }    
    } catch (error) {    
      addLog('Error al controlar la escucha', 'error');    
    }    
  };  
  
  // Función para verificar estado con useCallback para evitar dependencias circulares    
  const checkRon247Status = useCallback(async () => {
    try {
      const s = await window.electronAPI.getRon247Status();
      setIsActive(!!s.isRunning);
      setStatus((s.status || 'inactive').toLowerCase());
      setIsConnected(true);
      addLog(`Estado inicial: ${s.isRunning ? 'Activo' : 'Inactivo'}`, 'success');
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
  
  // Verificación periódica del estado (NUEVA)  
  useEffect(() => {
    const interval = setInterval(async () => {
      if (isActive) {
        try {
          const s = await window.electronAPI.getRon247Status();
          setStatus((s.status || 'inactive').toLowerCase());
        } catch (error) {
          console.error('Error checking status:', error);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isActive]); 
    
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
    const last = lines.reverse().find(l => l && !isLog(l));
    return last || raw;
  }
  return content.join('\n').trim();
};

// Escuchar eventos de Ron 24/7
useEffect(() => {
  if (!window.electronAPI) return;

  // PRELOAD ya llama callback(status) —> aquí solo recibes el string status
  const offStatus = window.electronAPI.onRon247StatusChange((newStatus) => {
    const s = (newStatus || '').toLowerCase();
    if (s) setStatus(s);
    addLog(`Estado cambiado a: ${newStatus}`, 'info');
  });

  // PRELOAD ya llama callback(output) —> aquí solo recibes el string output
  const offOutput = window.electronAPI.onRon247Output((output) => {
    const text = typeof output === 'string' ? output : String(output ?? '');
    const clean = sanitizeRonText(text);
    if (clean) addLog(`Ron: ${clean}`, 'voice');
  });

  // cleanup usando las funciones de desuscripción que devuelve el preload
  return () => {
    offStatus?.();
    offOutput?.();
  };
}, []);

    
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
            className="listening-toggle-button"    
            onClick={toggleListening}    
            disabled={!isActive}    
          >    
            {status === 'listening' ? '🔇 Pausar Escucha' : '🎤 Activar Escucha'}    
          </button>

  
          <button  
            className={`manual-recording-button ${recordingStatus}`}  
            onClick={handleRecordingToggle}  
            disabled={!isActive || recordingStatus === 'processing'}  
            title={isRecording ? 'Detener grabación' : 'Iniciar grabación manual'}  
          >  
            <div className="button-content">  
              <span className="button-text">  
                {recordingStatus === 'idle' && '🎤 Grabar'}  
                {recordingStatus === 'recording' && '🔴 Grabando...'}  
                {recordingStatus === 'processing' && '⏳ Procesando...'}  
              </span>  
              {recordingStatus === 'recording' && (  
                <canvas  
                  ref={canvasRef}  
                  className="spectrum-canvas"  
                  width="120"  
                  height="30"  
                />  
              )}  
            </div>  
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
          <li><strong>Control de Escucha:</strong> Usa "Pausar/Activar Escucha" para controlar solo el audio sin detener el proceso</li>  
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