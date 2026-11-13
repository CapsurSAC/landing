import { useEffect } from 'react';

/**
 * Mantiene `aria-invalid` sincronizado con el estado visual `:user-invalid`
 * y anuncia los errores por una única región aria-live.
 *
 * Hace falta porque `:user-invalid` es solo un estado de CSS: los lectores de
 * pantalla no se enteran de él. Y no se puede derivar de `checkValidity()`,
 * que ya devuelve false en un campo obligatorio que el usuario nunca tocó.
 *
 * @param {React.RefObject<HTMLFormElement>} formRef
 */
export function useValidacionAccesible(formRef) {
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    // Una sola región viva para toda la página.
    const anunciador = document.createElement('div');
    anunciador.setAttribute('aria-live', 'polite');
    anunciador.className = 'visually-hidden';
    document.body.append(anunciador);

    let temporizador;
    let campoAnunciado = null;
    const marcados = new WeakSet();
    const yaAnunciados = new WeakSet();

    /* El texto del error solo figura en aria-describedby mientras se muestra:
       lo que aria-describedby referencia se lee aunque esté oculto. */
    const vincularError = (el, visible) => {
      const idError = el.dataset.error;
      if (!idError) return;
      const ids = (el.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((id) => id && id !== idError);
      if (visible) ids.push(idError);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
      else el.removeAttribute('aria-describedby');
    };

    /* Texto tal como lo lee un lector de pantalla. */
    const textoHablado = (nodo) => {
      const copia = nodo.cloneNode(true);
      copia.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      copia
        .querySelectorAll('[role="img"][aria-label]')
        .forEach((n) => n.replaceWith(`${n.getAttribute('aria-label')}: `));
      return copia.textContent.replace(/\s+/g, ' ').trim();
    };

    const anunciarError = (el) => {
      const error = document.getElementById(el.dataset.error);
      if (!error) return;
      const etiqueta = el.labels?.[0] ? `${textoHablado(el.labels[0])}: ` : '';
      clearTimeout(temporizador);
      anunciador.textContent = '';
      campoAnunciado = el;
      // Espera a que el lector termine de anunciar el campo que recibe el foco.
      temporizador = setTimeout(() => {
        anunciador.textContent = etiqueta + textoHablado(error);
      }, 500);
    };

    const sincronizar = (el, anunciar = false) => {
      if (!el?.matches?.('input, select, textarea')) return;
      if (!form.contains(el)) return;

      const invalido = el.matches(':user-invalid');

      if (invalido) {
        if (anunciar && !yaAnunciados.has(el)) {
          anunciarError(el);
          yaAnunciados.add(el);
        }
        el.setAttribute('aria-invalid', 'true');
        vincularError(el, true);
        marcados.add(el);
      } else if (marcados.has(el) || el.getAttribute('aria-invalid') !== 'true') {
        el.setAttribute('aria-invalid', 'false');
        vincularError(el, false);
        marcados.delete(el);
        yaAnunciados.delete(el);
        if (campoAnunciado === el) {
          clearTimeout(temporizador);
          anunciador.textContent = '';
        }
      }
    };

    /* Arrancan todos en aria-invalid="false": Firefox y Safari exponen un campo
       required vacío como inválido desde la carga, y Chromium no lo expone tras
       interactuar salvo que aria-invalid="true" esté puesto explícitamente. */
    form.querySelectorAll('input, select, textarea').forEach((el) => sincronizar(el));

    const alSalir = (e) => sincronizar(e.target, true);
    const alEscribir = (e) => {
      if (e.target.hasAttribute('aria-invalid')) sincronizar(e.target);
    };
    const alCambiar = (e) => sincronizar(e.target, true);
    /* Un envío fallido dispara 'invalid' en cada campo, incluidos los que nunca
       se tocaron. No burbujea, por eso se escucha en fase de captura. El foco
       salta al primer inválido y eso ya anuncia su error. */
    const alSerInvalido = (e) => {
      yaAnunciados.add(e.target);
      sincronizar(e.target);
    };
    const alResetear = (e) => {
      setTimeout(() => [...e.target.elements].forEach((el) => sincronizar(el)));
    };

    form.addEventListener('blur', alSalir, true);
    form.addEventListener('input', alEscribir);
    form.addEventListener('change', alCambiar, true);
    form.addEventListener('invalid', alSerInvalido, true);
    form.addEventListener('reset', alResetear, true);

    return () => {
      form.removeEventListener('blur', alSalir, true);
      form.removeEventListener('input', alEscribir);
      form.removeEventListener('change', alCambiar, true);
      form.removeEventListener('invalid', alSerInvalido, true);
      form.removeEventListener('reset', alResetear, true);
      clearTimeout(temporizador);
      anunciador.remove();
    };
  }, [formRef]);
}
