import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PaginaProgramas from './PaginaProgramas.jsx';
import './index.css';
import { iniciarAnalitica } from './lib/analitica.js';
import { iniciarMedicion } from './lib/medicion.js';
import { capturarOrigen } from './lib/origen.js';

// Igual que en el inicio: si alguien entra aquí desde un anuncio, su origen viaja al formulario.
capturarOrigen();
iniciarAnalitica();
iniciarMedicion();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PaginaProgramas />
  </StrictMode>,
);
