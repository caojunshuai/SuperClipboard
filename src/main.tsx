import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';
import './locales'; // initialize i18n before rendering

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
