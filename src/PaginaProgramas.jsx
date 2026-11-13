import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import Programas from './components/Programas.jsx';
import Footer from './components/Footer.jsx';
import { IconoBirrete, IconoEnviar, IconoVolver } from './components/Iconos.jsx';
import { CATEGORIAS, PROGRAMAS, urlProgramas } from './data/programas.js';

/** La categoría va en el hash (#capacitacion); si no hay o no existe, se ven todos. */
const categoriaDeUrl = () => {
  const id = decodeURIComponent(location.hash.slice(1));
  return CATEGORIAS.some((c) => c.id === id) ? id : null;
};

/**
 * Página de programas: el detalle del PDF de CAPSUR, con filtros que son los
 * mismos cuatro enlaces de la cabecera.
 */
export default function PaginaProgramas() {
  const [categoria, setCategoria] = useState(categoriaDeUrl);

  // Los enlaces de la cabecera y los filtros solo cambian el hash: no recargan.
  useEffect(() => {
    const alCambiar = () => {
      setCategoria(categoriaDeUrl());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const nombre = CATEGORIAS.find((c) => c.id === categoria)?.nombre;
  const lista = categoria ? PROGRAMAS.filter((p) => p.categorias.includes(categoria)) : PROGRAMAS;

  useEffect(() => {
    document.title = `${nombre ?? 'Programas por institución'} — CAPSUR`;
  }, [nombre]);

  return (
    <div className="pantalla">
      <Header actual={categoria} conInicio />

      <main id="programas" className="mx-auto w-full max-w-[100rem] flex-1 px-5 pt-4 pb-10 sm:px-8">
        <a href="/" className="volver" data-medir="Programas: volver al inicio">
          <IconoVolver className="size-4" />
          Volver al inicio
        </a>

        <h1 className="mt-3 text-center text-[24px] leading-tight font-extrabold text-navy-900 lg:text-[30px]">
          {nombre ?? 'Programas por institución'}
        </h1>
        <p className="mt-1.5 text-center text-[14px] text-gris-texto">
          Conoce algunos de los programas de cada una de nuestras instituciones.
        </p>

        {/* Deja claro que no es el catálogo completo: lo demás lo cuenta un asesor. */}
        <p className="aviso-muestra">
          <IconoBirrete className="size-5 shrink-0 text-navy-900" />
          <span>
            <strong>Esto es solo una muestra.</strong> Tenemos más cursos, diplomados y carreras:{' '}
            <a href="/#formulario" data-medir="Programas: aviso de muestra">
              cuéntanos qué buscas
            </a>{' '}
            y un asesor te muestra toda la oferta.
          </span>
        </p>

        <nav aria-label="Filtrar programas" className="mt-5 flex flex-wrap justify-center gap-2">
          <a href={urlProgramas()} className="filtro" aria-current={categoria ? undefined : 'page'}>
            Todos
          </a>
          {CATEGORIAS.map(({ id, nombre: n }) => (
            <a
              key={id}
              href={urlProgramas(id)}
              className="filtro"
              aria-current={categoria === id ? 'page' : undefined}
              data-medir={`Filtro: ${n}`}
            >
              {n}
            </a>
          ))}
        </nav>

        <p className="mt-4 mb-4 text-center text-[13px] text-gris-texto" aria-live="polite">
          {lista.length} {lista.length === 1 ? 'institución' : 'instituciones'}
        </p>

        <Programas programas={lista} />

        <div className="mt-8 flex flex-col items-center gap-3 rounded-3xl bg-lavanda px-5 py-6 text-center">
          <p className="text-[17px] font-extrabold text-navy-900">¿No encuentras lo que buscas?</p>
          <p className="max-w-md text-[13.5px] text-gris-texto">
            Aquí ves solo una parte de nuestra oferta. Responde 3 preguntas y un asesor te
            recomienda la opción que mejor encaja contigo.
          </p>
          <a
            href="/#formulario"
            className="boton-principal w-auto px-6"
            data-medir="Programas: quiero orientación"
          >
            <IconoEnviar className="size-5" />
            Quiero recibir orientación
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
