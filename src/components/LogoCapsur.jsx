/** @param {'oscuro'|'claro'} variante  claro = para fondo azul */
export default function LogoCapsur({ variante = 'oscuro', className = '' }) {
  const esClaro = variante === 'claro';

  return (
    <img
      src="/logos/grupo-capsur.webp"
      alt="Grupo CAPSUR"
      className={`h-8 w-auto object-contain sm:h-9 ${esClaro ? 'brightness-0 invert' : ''} ${className}`}
      decoding="async"
    />
  );
}
