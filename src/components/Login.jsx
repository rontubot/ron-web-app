import React, { useState } from 'react';  
import { useAuth } from '../context/AuthContext';  
import './Login.css';  
  
const Login = () => {  
  const [isLogin, setIsLogin] = useState(true);  
  const [formData, setFormData] = useState({  
    username: '',  
    password: '',  
    email: ''  
  });  
  const [error, setError] = useState('');  
  const [loading, setLoading] = useState(false);  
    
  const { login, register } = useAuth();  
  
  const handleInputChange = (e) => {  
    setFormData({  
      ...formData,  
      [e.target.name]: e.target.value  
    });  
    setError(''); // Limpiar error al escribir  
  };  
  
  const handleSubmit = async (e) => {  
    e.preventDefault();  
    setLoading(true);  
    setError('');  
  
    try {  
      let result;  
      if (isLogin) {  
        result = await login(formData.username, formData.password);  
      } else {  
        result = await register(formData.username, formData.password, formData.email);  
      }  
  
      if (!result.success) {  
        setError(result.error);  
      }  
    } catch (err) {  
      setError('Error de conexión. Intenta de nuevo.');  
    } finally {  
      setLoading(false);  
    }  
  };  
  
  const toggleMode = () => {  
    setIsLogin(!isLogin);  
    setError('');  
    setFormData({  
      username: '',  
      password: '',  
      email: ''  
    });  
  };  
  
  return (  
    <div className="login-container">  
      <div className="login-card">  
        <div className="login-header">  
          <h1>🤖 Ron Assistant</h1>  
          <h2>{isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</h2>  
        </div>  
  
        <form onSubmit={handleSubmit} className="login-form">  
          <div className="form-group">  
            <label htmlFor="username">Usuario</label>  
            <input  
              type="text"  
              id="username"  
              name="username"  
              value={formData.username}  
              onChange={handleInputChange}  
              required  
              placeholder="Ingresa tu usuario"  
            />  
          </div>  
  
          {!isLogin && (  
            <div className="form-group">  
              <label htmlFor="email">Email</label>  
              <input  
                type="email"  
                id="email"  
                name="email"  
                value={formData.email}  
                onChange={handleInputChange}  
                required  
                placeholder="tu@email.com"  
              />  
            </div>  
          )}  
  
          <div className="form-group">  
            <label htmlFor="password">Contraseña</label>  
            <input  
              type="password"  
              id="password"  
              name="password"  
              value={formData.password}  
              onChange={handleInputChange}  
              required  
              placeholder="Ingresa tu contraseña"  
            />  
          </div>  
  
          {error && (  
            <div className="error-message">  
              {error}  
            </div>  
          )}  
  
          <button   
            type="submit"   
            className="login-button"  
            disabled={loading}  
          >  
            {loading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Crear Cuenta')}  
          </button>  
        </form>  
  
        <div className="login-footer">  
          <p>  
            {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}  
            <button   
              type="button"   
              className="toggle-button"  
              onClick={toggleMode}  
            >  
              {isLogin ? 'Crear una' : 'Iniciar sesión'}  
            </button>  
          </p>  
        </div>  
      </div>  
    </div>  
  );  
};  
  
export default Login;