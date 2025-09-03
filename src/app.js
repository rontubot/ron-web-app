import React from 'react';    
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';    
import { AuthProvider, useAuth } from './context/authcontext';    
import Login from './components/login';    
import Chat from './components/chat';    
import Ron24_7 from './components/ron24_7';  
import MainLayout from './components/mainLayout';  
import './app.css';    
    
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
                <MainLayout>  
                  <Chat />  
                </MainLayout>  
              </ProtectedRoute>    
            }     
          />  
          <Route     
            path="/ron247"     
            element={    
              <ProtectedRoute>    
                <MainLayout>  
                  <Ron24_7 />  
                </MainLayout>  
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