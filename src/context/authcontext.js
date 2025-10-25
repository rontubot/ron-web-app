// src/context/authcontext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ronAPI } from '../services/api';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

// Igual que en services/api.js
const RAW_BASE = process.env.REACT_APP_API_URL || 'https://ron-production.up.railway.app';
const API_BASE = (RAW_BASE || '').replace(/\/+$/, '');

export const AuthProvider = ({ children }) => {
  const [user, setUser]   = useState(null);
  const [token, setToken] = useState(localStorage.getItem('ron_token') || null);
  const [loading, setLoading] = useState(true);

  // Utilidad: obtener /auth/me aunque ronAPI no lo tenga expuesto
  const fetchMe = useCallback(async (tk) => {
    if (!tk) return null;
    if (typeof ronAPI.me === 'function') {
      return await ronAPI.me(tk);
    }
    // Fallback genérico
    try {
      return await ronAPI.request('/auth/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${tk}` },
      });
    } catch {
      return null;
    }
  }, []);

  // Sincroniza token y base con el proceso main (Electron) si existe
  const syncElectronBridge = useCallback((tk) => {
    try {
      if (!window?.electronAPI) return;
      // Asegura que el main use el MISMO backend que la SPA
      window.electronAPI.setApiBase?.(API_BASE);
      // Pasa/borra el JWT en el main
      window.electronAPI.setAuthToken?.(tk || null);
    } catch {
      // no romper la app si el bridge no está
    }
  }, []);

  // Boot de sesión al iniciar la app
  useEffect(() => {
    const boot = async () => {
      try {
        const saved = localStorage.getItem('ron_token');
        if (!saved) {
          setLoading(false);
          syncElectronBridge(null);
          return;
        }
        setToken(saved);
        syncElectronBridge(saved);
        const me = await fetchMe(saved);
        if (me) setUser(me);
        else {
          // token inválido
          localStorage.removeItem('ron_token');
          setToken(null);
          setUser(null);
          syncElectronBridge(null);
        }
      } catch {
        localStorage.removeItem('ron_token');
        setToken(null);
        setUser(null);
        syncElectronBridge(null);
      } finally {
        setLoading(false);
      }
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el token cambia en caliente, reflejar en Electron
  useEffect(() => {
    syncElectronBridge(token);
  }, [token, syncElectronBridge]);

  // Login: acepta (username, password) o ({ username, password })
  const login = useCallback(async (arg1, arg2) => {
    let username, password;
    if (typeof arg1 === 'object' && arg1 !== null) {
      ({ username, password } = arg1);
    } else {
      username = arg1;
      password = arg2;
    }
    const data = await ronAPI.login(username, password);
    const tk = data?.token;
    if (!tk) throw new Error('Token no recibido');

    localStorage.setItem('ron_token', tk);
    setToken(tk);
    syncElectronBridge(tk);

    const u = data?.user || (await fetchMe(tk));
    setUser(u || { username });
    return true;
  }, [fetchMe, syncElectronBridge]);

  // Register: acepta (username, password, email) o ({ username, password, email })
  const register = useCallback(async (arg1, arg2, arg3) => {
    let username, password, email;
    if (typeof arg1 === 'object' && arg1 !== null) {
      ({ username, password, email } = arg1);
    } else {
      username = arg1;
      password = arg2;
      email = arg3;
    }
    await ronAPI.register(username, password, email);
    return true;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) await ronAPI.logout(token);
    } catch (_) {}
    localStorage.removeItem('ron_token');
    setToken(null);
    setUser(null);
    syncElectronBridge(null);
  }, [token, syncElectronBridge]);

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    // Autenticación basada en token (no en user)
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
