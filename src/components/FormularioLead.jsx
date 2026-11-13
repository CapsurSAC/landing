import { useEffect, useRef, useState } from 'react';
import { useValidacionAccesible } from '../hooks/useValidacionAccesible.js';
import { registrarEvento } from '../lib/analitica.js';
import { medirFormulario, registrar } from '../lib/medicion.js';
import { leerOrigen, prefijoOrigen } from '../lib/origen.js';
import {
  borrarBorrador,
  cancelarSincronizacion,
  guardarBorrador,
  leerBorrador,
  retirarPosible,
  sincronizarPosible,
} from '../lib/borrador.js';
import { celularInventado, PATRON_CELULAR, PATRON_CORREO } from '../lib/reglas.js';
import { montarTurnstile, turnstileActivo } from '../lib/turnstile.js';
import { PROGRAMAS } from '../data/programas.js';
import { nuevoId } from '../lib/uuid.js';
import {
  AREAS,
  INICIOS,
  OBJETIVOS,
  URL_POLITICA,
  VERSION_CONSENTIMIENTO,
} from '../data/opciones.js';
import {
  IconoAlerta,
  IconoBirrete,
  IconoCheck,
  IconoEnviar,
  IconoReloj,
  IconoSobre,
  IconoUsuario,
  IconoWhatsApp,
} from './Iconos.jsx';

/**
 * Adónde se envían las solicitudes. Por defecto, el PHP propio de server/.
 * Se puede cambiar en .env (VITE_FORM_ENDPOINT), por ejemplo a Formspree
 * (https://formspree.io/f/xxxxxxxx) si no hay servidor con PHP. Ver README.
 */
const ENDPOINT = import.meta.env.VITE_FORM_ENDPOINT || '/api/enviar.php';

/** WhatsApp de atención (solo dígitos). Vacío = sin botón de WhatsApp. */
const WHATSAPP = (import.meta.env.VITE_WHATSAPP_NUMERO || '').replace(/\D/g, '');

/**
 * Enlace de WhatsApp con un mensaje ya escrito que lleva las respuestas del
 * formulario, para que el asesor las tenga a la vista al atender.
 * La línea "Ref: EM1-COMP" (origen-área) es la que lee el flujo de Chatwoot
 * para elegir la rama; si la persona la borra, el flujo la reconoce igual por
 * la frase "acabo de enviar el formulario de CAPSUR".
 *
 * El flujo busca "-COMP", "-MIN"… en cualquier parte del mensaje: por eso al
 * nombre se le quitan los guiones y el correo no viaja aquí (ya está en el
 * correo interno y en el panel).
 *
 * `enviado` es false cuando el servidor falló: el mensaje lo dice, porque en
 * ese caso las respuestas solo llegan por aquí.
 */
const enlaceWhatsApp = (ultimo, enviado = true) => {
  const nombre = (ultimo?.nombre ?? '').replace(/[-*_~\s]+/g, ' ').trim();
  const saludo = enviado
    ? 'Hola, acabo de enviar el formulario de CAPSUR y quisiera recibir orientación.'
    : 'Hola, intenté enviar el formulario de CAPSUR y no se pudo. Quisiera recibir orientación.';
  const respuestas = [
    ['Nombre', nombre],
    ['Área de interés', ultimo?.area],
    ['Programa', ultimo?.programa],
    ['Objetivo', ultimo?.objetivo],
    ['Inicio', ultimo?.inicio],
  ]
    .filter(([, valor]) => valor)
    .map(([etiqueta, valor]) => `*${etiqueta}:* ${valor}`);
  const referencia = `Ref: ${prefijoOrigen()}-${ultimo?.codigo ?? 'GEN'}`;
  const texto = [saludo, respuestas.join('\n'), referencia].filter(Boolean).join('\n\n');
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
};

/** Lo que se guarda del formulario a medio llenar (la autorización no: se marca cada vez). */
const CAMPOS_BORRADOR = ['area', 'objetivo', 'inicio', 'nombre', 'email', 'whatsapp'];

const datosDe = (form) => ({
  ...Object.fromEntries(CAMPOS_BORRADOR.map((c) => [c, form.elements[c]?.value?.trim() ?? ''])),
  marketing: form.marketing.checked,
});

const tieneAlgo = (datos) => CAMPOS_BORRADOR.some((c) => datos?.[c]);

/** Solo valores que siguen existiendo entre las opciones. */
/** Programa elegido en programas.html; dura lo que la pestaña (sessionStorage). */
const CLAVE_PROGRAMA = 'capsur_programa';
const leerPrograma = () => {
  try {
    return sessionStorage.getItem(CLAVE_PROGRAMA) || '';
  } catch {
    return '';
  }
};
const guardarPrograma = (nombre) => {
  try {
    if (nombre) sessionStorage.setItem(CLAVE_PROGRAMA, nombre);
    else sessionStorage.removeItem(CLAVE_PROGRAMA);
  } catch {
    // Sin almacenamiento: el programa solo vale hasta recargar.
  }
};

const opcionValida = (opciones, valor) => (opciones.some((o) => o.value === valor) ? valor : '');

/** Convierte el código de una opción en el texto que vio el usuario. */
const etiquetaDe = (opciones, valor) => opciones.find((o) => o.value === valor)?.label ?? valor;

function MensajeError({ id, children }) {
  return (
    <p id={id} className="mensaje-error">
      <IconoAlerta className="size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function Pregunta({ numero, id, etiqueta, opciones, valor, onChange }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13.5px] leading-tight font-bold text-navy-900"
      >
        {numero}. {etiqueta} <span className="text-magenta">*</span>
      </label>
      <select
        id={id}
        name={id}
        required
        value={valor}
        data-elegido={valor ? 'true' : 'false'}
        data-error={`${id}-error`}
        onChange={(e) => onChange(e.target.value)}
        className="campo-select"
      >
        <option value="">Selecciona una opción</option>
        {opciones.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <MensajeError id={`${id}-error`}>Elige una opción para continuar.</MensajeError>
    </div>
  );
}

function CampoTexto({ id, etiqueta, icono, error, opcional = false, ...props }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 flex items-center gap-2 text-[13.5px] leading-tight font-bold text-navy-900"
      >
        <span className="text-brand-600">{icono}</span>
        {etiqueta}
        {opcional ? (
          <span className="font-medium text-slate-500">(opcional)</span>
        ) : (
          <span className="text-magenta">*</span>
        )}
      </label>
      <input id={id} name={id} data-error={`${id}-error`} className="campo" {...props} />
      <MensajeError id={`${id}-error`}>{error}</MensajeError>
    </div>
  );
}

export default function FormularioLead() {
  const formRef = useRef(null);
  const [estado, setEstado] = useState('inicial'); // inicial | enviando | exito | error
  // Lo que dejó a medias en otra visita (src/lib/borrador.js). Se lee una vez.
  const inicial = useRef(undefined);
  if (inicial.current === undefined) inicial.current = leerBorrador()?.datos ?? null;
  const [seleccion, setSeleccion] = useState(() => ({
    area: opcionValida(AREAS, inicial.current?.area),
    objetivo: opcionValida(OBJETIVOS, inicial.current?.objetivo),
    inicio: opcionValida(INICIOS, inicial.current?.inicio),
  }));
  const [recuperado, setRecuperado] = useState(() => tieneAlgo(inicial.current));
  const enServidor = useRef(false); // ya mandó un posible en esta visita
  const [ultimo, setUltimo] = useState(null); // lo enviado, para el mensaje de WhatsApp
  const [celularFalso, setCelularFalso] = useState(false); // elige el mensaje de error del WhatsApp
  const [areaDeEnlace, setAreaDeEnlace] = useState(false); // llegó con ?area= desde programas.html
  // El programa que miraba al tocar "Me interesa" (programas.html): el asesor sabe de qué hablarle.
  const [programa, setPrograma] = useState(leerPrograma);
  const envioId = useRef(null); // se renueva solo cuando un envío sale bien
  const contenedorTurnstile = useRef(null);
  const turnstile = useRef({ token: '', widget: null });

  useValidacionAccesible(formRef);
  // Avance campo a campo para el panel de métricas; se vuelve a enganchar si el formulario se remonta.
  // Con datos recuperados, la medición los anota de entrada: en esta visita nadie los tocó.
  useEffect(
    () => medirFormulario(formRef.current, { restaurado: tieneAlgo(inicial.current) }),
    [estado],
  );

  // Llegada desde "Me interesa" en programas.html (/?area=…#formulario): marca el área,
  // baja al formulario y deja el foco en la pregunta siguiente.
  useEffect(() => {
    const url = new URL(location.href);
    const area = url.searchParams.get('area');
    const valida = AREAS.some((a) => a.value === area);
    if (area !== null) {
      // Fuera de la URL: así una recarga o un enlace compartido no la arrastra.
      url.searchParams.delete('area');
      history.replaceState(history.state, '', url);
    }
    if (valida) {
      setSeleccion((s) => ({ ...s, area }));
      setAreaDeEnlace(true);
    }
    const idPrograma = url.searchParams.get('programa');
    if (idPrograma !== null) {
      url.searchParams.delete('programa');
      history.replaceState(history.state, '', url);
      const elegido = PROGRAMAS.find((p) => p.id === idPrograma);
      if (elegido) {
        const nombre = `${elegido.institucion} — ${elegido.titulo}`;
        guardarPrograma(nombre);
        setPrograma(nombre);
      }
    }
    // El navegador no baja solo: cuando leyó el #formulario, React aún no lo había pintado.
    if (url.hash === '#formulario') {
      requestAnimationFrame(() => document.getElementById('formulario')?.scrollIntoView());
    }
  }, []);

  // Turnstile (anti-bots), solo si hay clave: se monta con el formulario y se quita con él.
  useEffect(() => {
    if (!turnstileActivo || estado === 'exito') return undefined;
    let vivo = true;
    montarTurnstile(contenedorTurnstile.current, (token) => {
      turnstile.current.token = token;
    })
      .then((widget) => {
        if (vivo) turnstile.current.widget = widget;
        else widget.quitar();
      })
      .catch(() => {
        // Sin Cloudflare a mano (bloqueador, red): el servidor decidirá.
      });
    return () => {
      vivo = false;
      turnstile.current.widget?.quitar();
      turnstile.current = { token: '', widget: null };
    };
  }, [estado === 'exito']); // eslint-disable-line react-hooks/exhaustive-deps

  // Ya con el área pintada en el select.
  useEffect(() => {
    const form = formRef.current;
    if (!areaDeEnlace || !form) return;
    // Un change real para que la medición lo cuente como si la hubiera elegido a mano.
    form.querySelector('#area')?.dispatchEvent(new Event('change', { bubbles: true }));
    form.querySelector('#objetivo')?.focus({ preventScroll: true });
  }, [areaDeEnlace]);

  /**
   * Cada cambio queda en este navegador. Al servidor, como posible, solo va con
   * la autorización marcada; si la desmarca, se le pide que lo borre.
   */
  function alCambiar() {
    const form = formRef.current;
    if (!form) return;
    const datos = datosDe(form);
    const id = guardarBorrador(datos);

    if (!form.consentimiento.checked) {
      if (enServidor.current) retirarPosible(id);
      enServidor.current = false;
      return;
    }
    enServidor.current = true;
    const origen = leerOrigen();
    sincronizarPosible({
      id,
      consentimiento: true,
      nombre: datos.nombre,
      email: datos.email,
      whatsapp: datos.whatsapp,
      // Los textos que vio, como en el envío: así se leen igual en el panel.
      area: datos.area ? etiquetaDe(AREAS, datos.area) : '',
      objetivo: datos.objetivo ? etiquetaDe(OBJETIVOS, datos.objetivo) : '',
      inicio: datos.inicio ? etiquetaDe(INICIOS, datos.inicio) : '',
      marketing: datos.marketing,
      programa,
      version_consentimiento: VERSION_CONSENTIMIENTO,
      pagina: window.location.href,
      ...origen,
    });
  }

  /** "¿No eres tú?": borra lo recuperado del navegador y del servidor. */
  function empezarDeCero() {
    const form = formRef.current;
    retirarPosible(leerBorrador()?.id);
    borrarBorrador();
    inicial.current = null;
    enServidor.current = false;
    if (form) {
      // reset() vuelve a los valores iniciales, que son los recuperados: primero se vacían.
      for (const campo of ['nombre', 'email', 'whatsapp']) form.elements[campo].defaultValue = '';
      form.marketing.defaultChecked = false;
      form.reset();
    }
    setSeleccion({ area: '', objetivo: '', inicio: '' });
    setCelularFalso(false);
    setRecuperado(false);
    form?.querySelector('#area')?.focus();
  }

  async function enviar(evento) {
    evento.preventDefault();
    if (estado === 'enviando') return;
    // Lo que faltaba por mandar como posible ya no hace falta: esto es el lead.
    cancelarSincronizacion();
    const posibleId = leerBorrador()?.id ?? '';

    const formulario = evento.currentTarget;
    const datos = Object.fromEntries(new FormData(formulario).entries());
    const origen = leerOrigen();
    const codigoArea = AREAS.find((a) => a.value === datos.area)?.codigo ?? 'GEN';
    // Si la persona reintenta tras un error viaja el mismo: el backend no duplica el lead.
    envioId.current ??= nuevoId();

    const area = etiquetaDe(AREAS, datos.area);
    const objetivo = etiquetaDe(OBJETIVOS, datos.objetivo);
    const inicio = etiquetaDe(INICIOS, datos.inicio);
    // Antes de enviar: si el servidor falla, el enlace de WhatsApp del aviso de error también las lleva.
    setUltimo({ nombre: datos.nombre, area, programa, objetivo, inicio, codigo: codigoArea });

    setEstado('enviando');
    try {
      const respuesta = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: `Nueva solicitud de orientación — ${datos.nombre}`,
          _gotcha: datos._gotcha, // trampa antibots de Formspree
          website: datos._gotcha, // la misma trampa, con el nombre que espera el PHP propio
          nombre: datos.nombre,
          email: datos.email,
          // Vacío si no lo dio: el PHP valida el formato y pone el guion él mismo.
          whatsapp: datos.whatsapp || '',
          area,
          objetivo,
          inicio,
          // Booleanos reales: el PHP los valida con FILTER_VALIDATE_BOOLEAN.
          consentimiento: formulario.consentimiento.checked,
          marketing: formulario.marketing.checked,
          version_consentimiento: VERSION_CONSENTIMIENTO,
          pagina: window.location.href,
          envio_id: envioId.current,
          // El borrador que tenía en el servidor: al llegar el lead, deja de ser un posible.
          posible_id: posibleId,
          // Códigos, además de los textos de arriba: con ellos se reparte y se etiqueta.
          area_codigo: codigoArea,
          programa,
          // Anti-bots (si está activo): el servidor lo verifica con Cloudflare.
          turnstile: turnstile.current.token,
          area_valor: datos.area,
          objetivo_valor: datos.objetivo,
          inicio_valor: datos.inicio,
          // Origen guardado al llegar: sigue aunque la URL ya no tenga las UTM.
          utm_source: origen.utm_source,
          utm_medium: origen.utm_medium,
          utm_campaign: origen.utm_campaign,
          utm_content: origen.utm_content,
        }),
      });

      // Cada token de Turnstile vale para un solo envío: se pide otro para el próximo.
      turnstile.current.widget?.reiniciar();
      if (!respuesta.ok) throw new Error('El servidor rechazó el envío');

      envioId.current = null;
      borrarBorrador();
      inicial.current = null; // "Enviar otra solicitud" abre el formulario vacío
      enServidor.current = false;
      setRecuperado(false);
      registrarEvento('Lead', { content_category: area });
      registrar({ tipo: 'envio' });
      guardarPrograma('');
      setPrograma('');
      setEstado('exito');
      formulario.reset();
      setSeleccion({ area: '', objetivo: '', inicio: '' });
    } catch {
      setEstado('error');
    }
  }

  /* ── Pantalla de agradecimiento ───────────────────────────── */
  if (estado === 'exito') {
    return (
      <div className="flex w-full items-center rounded-3xl bg-white p-7 shadow-2xl ring-1 ring-slate-900/5 sm:p-9">
        <div
          className="flex w-full flex-col items-center text-center"
          role="status"
          aria-live="polite"
        >
          <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100">
            <IconoCheck className="size-8 text-emerald-600" />
          </span>
          <h2 className="mt-5 text-2xl font-extrabold text-navy-900">¡Solicitud recibida!</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-gris-texto">
            {WHATSAPP
              ? 'Gracias por escribirnos. Escríbele a un asesor por WhatsApp y te orienta sobre las alternativas que mejor encajan con lo que buscas.'
              : 'Gracias por escribirnos. Uno de nuestros asesores revisará tus respuestas y se comunicará contigo con las alternativas que mejor encajen con lo que buscas.'}
          </p>
          {WHATSAPP && (
            <a
              href={enlaceWhatsApp(ultimo)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => registrarEvento('Contact')}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-[15.5px] font-bold text-white shadow-lg transition-colors hover:bg-emerald-600"
            >
              <IconoWhatsApp className="size-5" />
              Habla ahora con un asesor
            </a>
          )}
          {WHATSAPP && (
            <p className="mt-2 text-[13px] text-gris-texto">
              Tus respuestas ya van escritas en el mensaje: solo toca enviar. Te responde un asesor
              en minutos, en horario de atención.
            </p>
          )}
          <button
            type="button"
            onClick={() => setEstado('inicial')}
            className={`${WHATSAPP ? 'mt-4' : 'mt-7'} rounded-xl border-2 border-brand-600 px-6 py-3 text-[15px] font-bold text-brand-600 transition-colors hover:bg-brand-600 hover:text-white`}
          >
            Enviar otra solicitud
          </button>
        </div>
      </div>
    );
  }

  /* ── Formulario ───────────────────────────────────────────── */
  return (
    <div className="flex w-full flex-col rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-slate-900/5 sm:p-6">
      <div className="shrink-0 text-center">
        <h2 className="flex items-center justify-center gap-2 text-[19px] leading-tight font-extrabold text-navy-900 sm:text-[21px]">
          <IconoBirrete className="size-6 shrink-0 text-brand-600" />
          Descubre tu formación ideal
        </h2>
        <p className="mt-1.5 text-[13px] leading-snug text-gris-texto">
          Cuéntanos qué buscas y recibe orientación{' '}
          <strong className="font-bold text-navy-900">personalizada de nuestros asesores.</strong>
        </p>
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-lavanda px-3.5 py-1 text-[12px] font-semibold text-navy-800">
          <IconoReloj className="size-3.5 text-brand-600" />
          Menos de 1 minuto
        </p>
      </div>

      <form
        ref={formRef}
        onSubmit={enviar}
        onChange={alCambiar}
        method="POST"
        action={ENDPOINT}
        className="mt-4 flex flex-col"
      >
        {recuperado && (
          <div className="aviso-recuperado" role="status">
            <span>Recuperamos lo que dejaste a medias.</span>
            <button type="button" onClick={empezarDeCero} data-medir="Borrar datos recuperados">
              ¿No eres tú? Borrar
            </button>
          </div>
        )}
        <div className="space-y-3 pr-1">
          {/* Trampa para bots: fuera de pantalla, sin foco y oculta a lectores. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
            <label htmlFor="_gotcha">No completes este campo</label>
            <input id="_gotcha" name="_gotcha" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          <Pregunta
            numero={1}
            id="area"
            etiqueta="¿Qué área profesional te interesa?"
            opciones={AREAS}
            valor={seleccion.area}
            onChange={(v) => setSeleccion((s) => ({ ...s, area: v }))}
          />
          <Pregunta
            numero={2}
            id="objetivo"
            etiqueta="¿Qué te gustaría conseguir?"
            opciones={OBJETIVOS}
            valor={seleccion.objetivo}
            onChange={(v) => setSeleccion((s) => ({ ...s, objetivo: v }))}
          />
          <Pregunta
            numero={3}
            id="inicio"
            etiqueta="¿Cuándo te gustaría comenzar?"
            opciones={INICIOS}
            valor={seleccion.inicio}
            onChange={(v) => setSeleccion((s) => ({ ...s, inicio: v }))}
          />

          <hr className="border-slate-200" />

          <CampoTexto
            id="nombre"
            etiqueta="Tu nombre completo"
            icono={<IconoUsuario className="size-4" />}
            type="text"
            required
            minLength={3}
            maxLength={80}
            autoComplete="name"
            defaultValue={inicial.current?.nombre ?? ''}
            enterKeyHint="next"
            placeholder="Escribe tu nombre"
            error="Escribe tu nombre completo (mínimo 3 caracteres)."
          />

          <CampoTexto
            id="email"
            etiqueta="Correo electrónico"
            icono={<IconoSobre className="size-4" />}
            type="email"
            required
            maxLength={120}
            autoComplete="email"
            defaultValue={inicial.current?.email ?? ''}
            inputMode="email"
            enterKeyHint="next"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck="false"
            pattern={PATRON_CORREO}
            title="Un correo completo, por ejemplo nombre@dominio.com"
            placeholder="correo@ejemplo.com"
            error="Revisa el correo: debe tener el formato nombre@dominio.com"
          />

          <CampoTexto
            id="whatsapp"
            etiqueta="WhatsApp"
            opcional
            icono={<IconoWhatsApp className="size-4 text-emerald-500" />}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={inicial.current?.whatsapp ?? ''}
            enterKeyHint="done"
            maxLength={20}
            pattern={PATRON_CELULAR}
            title="Tu celular de 9 dígitos, que empieza con 9"
            placeholder="Tu celular de 9 dígitos"
            // En captura: debe correr antes que useValidacionAccesible, que lee :user-invalid al escribir.
            onInputCapture={(e) => {
              const falso = celularInventado(e.target.value);
              e.target.setCustomValidity(falso ? 'Ese número no parece real.' : '');
              setCelularFalso(falso);
            }}
            error={
              celularFalso
                ? 'Ese número no parece real. Escribe tu celular o deja el campo vacío.'
                : 'Escribe un celular de 9 dígitos que empiece con 9.'
            }
          />

          {/* ── Consentimientos ──────────────────────────────── */}
          <fieldset className="space-y-2 border-0 p-0">
            <legend className="visually-hidden">Autorizaciones</legend>

            <div>
              <div className="flex items-start gap-3">
                <input
                  id="consentimiento"
                  name="consentimiento"
                  type="checkbox"
                  required
                  data-error="consentimiento-error"
                  className="casilla"
                />
                <label
                  htmlFor="consentimiento"
                  className="text-[12px] leading-snug text-gris-texto"
                >
                  He leído la{' '}
                  <a
                    href={URL_POLITICA}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-600 underline underline-offset-2 hover:text-navy-900"
                  >
                    Política de Privacidad
                  </a>{' '}
                  y autorizo el tratamiento de mis datos para responder a mi solicitud.
                  <span className="text-magenta"> *</span>
                </label>
              </div>
              <MensajeError id="consentimiento-error">
                Necesitamos tu autorización para poder contactarte.
              </MensajeError>
            </div>

            <div className="flex items-start gap-3">
              <input
                id="marketing"
                name="marketing"
                type="checkbox"
                className="casilla"
                defaultChecked={Boolean(inicial.current?.marketing)}
              />
              <label htmlFor="marketing" className="text-[12px] leading-snug text-gris-texto">
                Deseo recibir información sobre programas, novedades y beneficios de CAPSUR.
              </label>
            </div>
          </fieldset>
        </div>

        {estado === 'error' && (
          <div role="alert" className="mt-3 shrink-0">
            <div
              role="presentation"
              className="flex items-start gap-2.5 rounded-xl border border-magenta/30 bg-rose-50 p-3 text-[13px] text-magenta"
            >
              <IconoAlerta className="mt-0.5 size-4 shrink-0" />
              <span>
                No pudimos enviar tu solicitud. Revisa tu conexión e inténtalo otra vez
                {WHATSAPP ? (
                  <>
                    , o{' '}
                    <a
                      href={enlaceWhatsApp(ultimo, false)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold underline underline-offset-2"
                    >
                      escríbenos por WhatsApp
                    </a>
                    .
                  </>
                ) : (
                  '.'
                )}
              </span>
            </div>
          </div>
        )}

        {/* Turnstile: casi siempre invisible; solo muestra una casilla si duda. */}
        {turnstileActivo && <div ref={contenedorTurnstile} className="mt-3 empty:hidden" />}

        <button type="submit" disabled={estado === 'enviando'} className="boton-principal mt-3">
          {estado === 'enviando' ? (
            <>
              <svg viewBox="0 0 24 24" className="size-5 animate-spin" aria-hidden="true">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  opacity="0.25"
                />
                <path
                  d="M12 2a10 10 0 0 1 10 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              Enviando…
            </>
          ) : (
            <>
              <IconoEnviar className="size-5" />
              Quiero recibir orientación
            </>
          )}
        </button>
      </form>
    </div>
  );
}
