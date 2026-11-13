import { useEffect, useState } from 'react';
import { IconoEnviar } from './Iconos.jsx';

/**
 * Botón fijo al pie de la pantalla en móvil, donde el formulario queda
 * casi dos pantallas por debajo del hero. Se muestra solo mientras el
 * formulario está por debajo del área visible; al llegar a él, o al
 * pasarlo, desaparece. En escritorio el formulario siempre está a la
 * vista, así que no se muestra.
 */
export default function BotonFlotante() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const formulario = document.getElementById('formulario');
    if (!formulario) return undefined;

    // Se muestra mientras el borde superior del formulario quede por debajo
    // del 90 % de la pantalla; al asomar, o al dejarlo atrás, se oculta.
    // Es un cálculo directo (no IntersectionObserver) para que el estado
    // inicial sea correcto desde el primer pintado.
    const actualizar = () => {
      setVisible(formulario.getBoundingClientRect().top > window.innerHeight * 0.9);
    };
    actualizar();
    window.addEventListener('scroll', actualizar, { passive: true });
    window.addEventListener('resize', actualizar);
    return () => {
      window.removeEventListener('scroll', actualizar);
      window.removeEventListener('resize', actualizar);
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 px-4 pt-3 backdrop-blur transition-all duration-300 lg:hidden ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
      }`}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <a href="#formulario" className="boton-principal" tabIndex={visible ? 0 : -1} data-medir="botón flotante móvil">
        <IconoEnviar className="size-5" />
        Quiero recibir orientación
      </a>
    </div>
  );
}
