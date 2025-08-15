export default App;
export default App;
export default App;
import React from 'react';  
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';  
import { AuthProvider, useAuth } from './context/AuthContext';  
import Login from './components/Login';  
import Chat from './components/Chat';  
import './App.css';  
  
// Componente para rutas protegidas  
const ProtectedRoute = ({ children }) => {  
  const { isAuthenticated, loading } = useAuth();  
    
  if (loading) {  
    return (  
      <div className="loading-container">  
        <div className="loading-spinner">🤖</div>  
        <p>Cargando a Ron...</p>  
      </div>  
    );  
  }  
    
  return isAuthenticated ? children : <Navigate to="/login" replace />;  
};  
  
// Componente para rutas públicas (solo accesibles si NO está autenticado)  
const PublicRoute = ({ children }) => {  
  const { isAuthenticated, loading } = useAuth();  
    
  if (loading) {  
    return (  
      <div className="loading-container">  
        <div className="loading-spinner">🤖</div>  
        <p>Cargando a Ron...</p>  
      </div>  
    );  
  }  
    
  return !isAuthenticated ? children : <Navigate to="/chat" replace />;  
};  
  
function AppContent() {  
  return (  
    <Router>  
      <div className="app">  
        <Routes>  
          <Route   
            path="/login"   
            element={  
              <PublicRoute>  
                <Login />  
              </PublicRoute>  
            }   
          />  
          <Route   
            path="/chat"   
            element={  
              <ProtectedRoute>  
                <Chat />  
              </ProtectedRoute>  
            }   
          />  
          <Route path="/" element={<Navigate to="/chat" replace />} />  
          <Route path="*" element={<Navigate to="/chat" replace />} />  
        </Routes>  
      </div>  
    </Router>  
  );  
}  
  
function App() {  
  return (  
    <AuthProvider>  
      <AppContent />  
    </AuthProvider>  
  );  
}  
  
export default App;