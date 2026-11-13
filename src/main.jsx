import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { iniciarAnalitica } from './lib/analitica.js';
import { iniciarMedicion } from './lib/medicion.js';
import { capturarOrigen } from './lib/origen.js';

// Primero el origen: así las UTM quedan guardadas antes de que nada toque la URL.
capturarOrigen();
iniciarAnalitica();
iniciarMedicion();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
