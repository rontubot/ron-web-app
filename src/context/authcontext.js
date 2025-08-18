import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';  
import { ronAPI } from '../services/api';  
  
const AuthContext = createContext();  
  
export const useAuth = () => {  
  const context = useContext(AuthContext);  
  if (!context) {  
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');  
  }  
  return context;  
};  
  
export const AuthProvider = ({ children }) => {  
  const [user, setUser] = useState(null);  
  const [token, setToken] = useState(localStorage.getItem('ron_token'));  
  const [loading, setLoading] = useState(true);  
  
  const logout = useCallback(async () => {  
    try {  
      if (token) {  
        await ronAPI.logout(token);  
      }  
    } catch (error) {  
      console.error('Error al cerrar sesión:', error);  
    } finally {  
      setToken(null);  
      setUser(null);  
      localStorage.removeItem('ron_token');  
    }  
  }, [token]);  
  
  useEffect(() => {  
    const checkAuth = async () => {  
      if (token) {  
        try {  
          const profile = await ronAPI.getUserProfile(token);  
          setUser(profile);  
        } catch (error) {  
          console.error('Token inválido:', error);  
          logout();  
        }  
      }  
      setLoading(false);  
    };  
  
    checkAuth();  
  }, [token, logout]); // Agregada la dependencia 'logout'  
  
  const login = async (username, password) => {  
    try {  
      const response = await ronAPI.login(username, password);  
      const { access_token, username: userName } = response;  
          
      setToken(access_token);  
      setUser({ username: userName });  
      localStorage.setItem('ron_token', access_token);  
          
      return { success: true };  
    } catch (error) {  
      return { success: false, error: error.message };  
    }  
  };  
  
  const register = async (username, password, email) => {  
    try {  
      await ronAPI.register(username, password, email);  
      return await login(username, password);  
    } catch (error) {  
      return { success: false, error: error.message };  
    }  
  };  
  
  const value = {  
    user,  
    token,  
    loading,  
    login,  
    register,  
    logout,  
    isAuthenticated: !!user && !!token,  
  };  
  
  return (  
    <AuthContext.Provider value={value}>  
      {children}  
    </AuthContext.Provider>  
  );  
};