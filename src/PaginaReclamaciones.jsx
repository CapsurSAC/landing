import { useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { IconoCheck, IconoVolver } from './components/Iconos.jsx';
import { EMPRESA, EMPRESA_PENDIENTE } from './data/empresa.js';
import { URL_POLITICA } from './data/opciones.js';
import { correoValido } from './lib/reglas.js';
import './styles/reclamaciones.css';

/**
 * Libro de Reclamaciones virtual (Código de Protección y Defensa del
 * Consumidor, Ley 29571, y su reglamento D.S. 011-2011-PCM). La hoja queda
 * guardada con un número correlativo, la persona recibe una copia por correo
 * y CAPSUR responde desde el panel en 15 días hábiles como máximo.
 */
const hoy = () =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(
    new Date(),
  );

function Campo({ id, etiqueta, opcional = false, children }) {
  return (
    <div className="reclamo__campo">
      <label htmlFor={id}>
        {etiqueta}{' '}
        {opcional ? (
          <span className="opcional">(opcional)</span>
        ) : (
          <span aria-hidden="true">*</span>
        )}
      </label>
      {children}
    </div>
  );
}

export default function PaginaReclamaciones() {
  const formRef = useRef(null);
  const [estado, setEstado] = useState('inicial'); // inicial | enviando | listo | error
  const [numero, setNumero] = useState('');
  const [error, setError] = useState('');
  const [menor, setMenor] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    const form = evento.currentTarget;
    if (!correoValido(form.correo.value.trim())) {
      form.correo.setCustomValidity('Escribe un correo completo, por ejemplo nombre@dominio.com');
      form.correo.reportValidity();
      return;
    }
    setEstado('enviando');
    setError('');
    const datos = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch('/api/reclamo.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          ...datos,
          menor: menor,
          acepta_correo: form.acepta_correo.checked,
          consentimiento: form.consentimiento.checked,
          website: datos.website, // trampa para bots
        }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok || !cuerpo.numero) throw new Error(cuerpo.error || 'No se pudo registrar');
      setNumero(cuerpo.numero);
      setEstado('listo');
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(e.message);
      setEstado('error');
    }
  }

  return (
    <div className="pantalla">
      <Header conInicio />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-4 pb-10 sm:px-8">
        <a href="/" className="volver">
          <IconoVolver className="size-4" />
          Volver al inicio
        </a>

        <h1 className="mt-3 text-center text-[24px] font-extrabold text-navy-900 lg:text-[28px]">
          Libro de Reclamaciones
        </h1>
        <p className="mt-1 text-center text-[13.5px] text-gris-texto">
          Conforme al Código de Protección y Defensa del Consumidor, este establecimiento cuenta con
          un Libro de Reclamaciones virtual.
        </p>

        <section className="reclamo__proveedor" aria-label="Datos del proveedor">
          <p>
            <strong>{EMPRESA.razonSocial}</strong> · RUC {EMPRESA.ruc}
          </p>
          <p>{EMPRESA.direccion}</p>
          <p>Fecha: {hoy()}</p>
          {EMPRESA_PENDIENTE && import.meta.env.DEV && (
            <p className="reclamo__pendiente">
              Faltan los datos de la empresa en src/data/empresa.js (solo se ve en desarrollo).
            </p>
          )}
        </section>

        {estado === 'listo' ? (
          <div className="reclamo__listo" role="status">
            <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100">
              <IconoCheck className="size-7 text-emerald-600" />
            </span>
            <h2>Registramos tu hoja de reclamación</h2>
            <p>
              Tu número es <strong>{numero}</strong>. Te enviamos una copia a tu correo. Te
              responderemos en un plazo máximo de 15 días hábiles.
            </p>
            <a href="/" className="boton-principal mt-4 w-auto px-6">
              Volver al inicio
            </a>
          </div>
        ) : (
          <form ref={formRef} className="reclamo" onSubmit={enviar} noValidate={false}>
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
              <label htmlFor="website">No completes este campo</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>

            <fieldset>
              <legend>1. Identificación del consumidor reclamante</legend>
              <Campo id="nombre" etiqueta="Nombre completo">
                <input
                  id="nombre"
                  name="nombre"
                  required
                  minLength={3}
                  maxLength={100}
                  autoComplete="name"
                />
              </Campo>
              <div className="reclamo__fila">
                <Campo id="tipo_documento" etiqueta="Documento">
                  <select id="tipo_documento" name="tipo_documento" required defaultValue="DNI">
                    <option>DNI</option>
                    <option>Carné de extranjería</option>
                    <option>Pasaporte</option>
                  </select>
                </Campo>
                <Campo id="documento" etiqueta="Número">
                  <input
                    id="documento"
                    name="documento"
                    required
                    minLength={6}
                    maxLength={15}
                    pattern="[A-Za-z0-9]{6,15}"
                  />
                </Campo>
              </div>
              <Campo id="domicilio" etiqueta="Domicilio">
                <input
                  id="domicilio"
                  name="domicilio"
                  required
                  maxLength={200}
                  autoComplete="street-address"
                />
              </Campo>
              <div className="reclamo__fila">
                <Campo id="telefono" etiqueta="Teléfono">
                  <input
                    id="telefono"
                    name="telefono"
                    type="tel"
                    required
                    maxLength={20}
                    pattern="[0-9 +\(\)\-]{6,20}"
                    autoComplete="tel"
                  />
                </Campo>
                <Campo id="correo" etiqueta="Correo electrónico">
                  <input
                    id="correo"
                    name="correo"
                    type="email"
                    required
                    maxLength={120}
                    autoComplete="email"
                    onInput={(e) => e.currentTarget.setCustomValidity('')}
                  />
                </Campo>
              </div>
              <label className="reclamo__casilla">
                <input
                  type="checkbox"
                  checked={menor}
                  onChange={(e) => setMenor(e.target.checked)}
                />
                Soy menor de edad
              </label>
              {menor && (
                <Campo id="apoderado" etiqueta="Nombre del padre, madre o apoderado">
                  <input id="apoderado" name="apoderado" required maxLength={100} />
                </Campo>
              )}
            </fieldset>

            <fieldset>
              <legend>2. Identificación del bien contratado</legend>
              <div className="reclamo__fila">
                <Campo id="bien" etiqueta="Tipo">
                  <select id="bien" name="bien" required defaultValue="Servicio">
                    <option>Servicio</option>
                    <option>Producto</option>
                  </select>
                </Campo>
                <Campo id="monto" etiqueta="Monto reclamado (S/)" opcional>
                  <input
                    id="monto"
                    name="monto"
                    inputMode="decimal"
                    maxLength={12}
                    pattern="[0-9]+([.,][0-9]{1,2})?"
                  />
                </Campo>
              </div>
              <Campo id="descripcion_bien" etiqueta="Descripción (programa, curso o servicio)">
                <input id="descripcion_bien" name="descripcion_bien" required maxLength={200} />
              </Campo>
            </fieldset>

            <fieldset>
              <legend>3. Detalle de la reclamación y pedido del consumidor</legend>
              <div className="reclamo__opciones" role="radiogroup" aria-label="Tipo">
                <label>
                  <input type="radio" name="tipo" value="Reclamo" required defaultChecked />
                  <span>
                    <strong>Reclamo:</strong> disconformidad con el producto o servicio.
                  </span>
                </label>
                <label>
                  <input type="radio" name="tipo" value="Queja" />
                  <span>
                    <strong>Queja:</strong> malestar con la atención al público, no relacionado con
                    el producto o servicio.
                  </span>
                </label>
              </div>
              <Campo id="detalle" etiqueta="Detalle">
                <textarea
                  id="detalle"
                  name="detalle"
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={5}
                />
              </Campo>
              <Campo id="pedido" etiqueta="Pedido">
                <textarea
                  id="pedido"
                  name="pedido"
                  required
                  minLength={5}
                  maxLength={1500}
                  rows={3}
                />
              </Campo>
            </fieldset>

            <label className="reclamo__casilla">
              <input id="acepta_correo" name="acepta_correo" type="checkbox" defaultChecked />
              Acepto que la respuesta a esta hoja de reclamación me llegue por correo electrónico.
            </label>
            <label className="reclamo__casilla">
              <input id="consentimiento" name="consentimiento" type="checkbox" required />
              <span>
                He leído la{' '}
                <a href={URL_POLITICA} target="_blank" rel="noopener noreferrer">
                  Política de Privacidad
                </a>{' '}
                y autorizo el tratamiento de mis datos para atender esta reclamación. *
              </span>
            </label>

            <p className="reclamo__nota">
              La formulación del reclamo no impide acudir a otras vías de solución de controversias
              ni es requisito previo para interponer una denuncia ante el INDECOPI. El proveedor
              responderá en un plazo no mayor a quince (15) días hábiles.
            </p>

            {estado === 'error' && (
              <p className="mensaje-error" role="alert">
                {error || 'No pudimos registrar tu hoja. Inténtalo de nuevo en unos minutos.'}
              </p>
            )}

            <button type="submit" className="boton-principal" disabled={estado === 'enviando'}>
              {estado === 'enviando' ? 'Enviando…' : 'Enviar hoja de reclamación'}
            </button>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
