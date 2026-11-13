// Primero la hoja base: fija el orden de las capas de Tailwind para las demás.
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PaginaReclamaciones from './PaginaReclamaciones.jsx';
import { iniciarAnalitica } from './lib/analitica.js';
import { iniciarMedicion } from './lib/medicion.js';
import { capturarOrigen } from './lib/origen.js';

// Igual que en el inicio: si alguien entra aquí desde un anuncio, su origen viaja al formulario.
capturarOrigen();
iniciarAnalitica();
iniciarMedicion();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PaginaReclamaciones />
  </StrictMode>,
);
