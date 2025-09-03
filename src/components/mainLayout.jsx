import React from 'react';  
import { useLocation, useNavigate } from 'react-router-dom';  
import { useAuth } from '../context/authcontext';  
import './MainLayout.css';  
  
const MainLayout = ({ children }) => {  
  const location = useLocation();  
  const navigate = useNavigate();  
  const { user, logout } = useAuth();  
  
  const tabs = [  
    { id: 'chat', label: '💬 Chat de Texto', path: '/chat' },  
    { id: 'ron247', label: '🎤 Ron 24/7', path: '/ron247' }  
  ];  
  
  const activeTab = location.pathname === '/ron247' ? 'ron247' : 'chat';  
  
  const handleTabChange = (path) => {  
    navigate(path);  
  };  
  
  const handleLogout = async () => {  
    try {  
      await logout();  
    } catch (error) {  
      console.error('Error during logout:', error);  
    }  
  };  
  
  return (  
    <div className="main-layout">  
      <div className="main-header">  
        <div className="header-left">  
          <h1 className="app-title">🤖 Ron Assistant</h1>  
          <div className="user-info">  
            <span>Hola, {user?.username}</span>  
          </div>  
        </div>  
          
        <div className="header-center">  
          <div className="tab-navigation">  
            {tabs.map(tab => (  
              <button  
                key={tab.id}  
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}  
                onClick={() => handleTabChange(tab.path)}  
              >  
                {tab.label}  
              </button>  
            ))}  
          </div>  
        </div>  
  
        <div className="header-right">  
          <button className="logout-button" onClick={handleLogout}>  
            🚪 Cerrar Sesión  
          </button>  
        </div>  
      </div>  
  
      <div className="main-content">  
        {children}  
      </div>  
    </div>  
  );  
};  
  
export default MainLayout;