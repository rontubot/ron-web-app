export const API_URL =
  // Vite
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_RON_API_URL) ||
  // CRA
  process.env.REACT_APP_RON_API_URL ||
  // Fallback (cámbialo por tu dominio real)
  "https://TU-BACKEND-RON.example.com";