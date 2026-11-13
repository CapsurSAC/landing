import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import Programas from './components/Programas.jsx';
import Footer from './components/Footer.jsx';
import { IconoBirrete, IconoEnviar, IconoVolver } from './components/Iconos.jsx';
import { CATEGORIAS, PROGRAMAS, urlProgramas } from './data/programas.js';

const TITULO = 'Programas por institución';
const DESCRIPCION =
  'Conoce algunos de los programas de las instituciones de Grupo CAPSUR: carreras técnicas, especializaciones, capacitación y convalidación.';

const existe = (id) => CATEGORIAS.some((c) => c.id === id);

/**
 * La categoría va en la ruta (/programas/capacitacion). Las direcciones
 * antiguas con #capacitacion se pasan a la ruta nueva sin recargar.
 */
function categoriaDeUrl() {
  const enRuta = location.pathname.match(/^\/programas\/([a-z-]+)\/?$/)?.[1];
  if (existe(enRuta)) return enRuta;
  const enHash = decodeURIComponent(location.hash.slice(1));
  if (existe(enHash)) {
    history.replaceState(null, '', urlProgramas(enHash) + location.search);
    return enHash;
  }
  return null;
}

/** Cambia una etiqueta <meta> de la cabecera (Google la lee al renderizar). */
function ponerMeta(atributo, clave, valor) {
  document.querySelector(`meta[${atributo}="${clave}"]`)?.setAttribute('content', valor);
}

/** Datos estructurados (schema.org) de los programas visibles, para Google. */
function datosEstructurados(lista) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: lista.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Course',
        name: p.titulo,
        description: p.descripcion,
        provider: { '@type': 'EducationalOrganization', name: p.institucion },
      },
    })),
  }).replace(/</g, '\\u003c'); // ningún "</script>" dentro del JSON
}

/**
 * Página de programas: el detalle del PDF de CAPSUR, con filtros que son los
 * mismos cuatro enlaces de la cabecera.
 */
export default function PaginaProgramas() {
  const [categoria, setCategoria] = useState(categoriaDeUrl);
  // Programa al que llegó un enlace compartido (?ver=matpel)
  const [destacado] = useState(() => new URLSearchParams(location.search).get('ver'));

  // Los filtros cambian la ruta sin recargar; atrás/adelante también funcionan.
  useEffect(() => {
    const alVolver = () => setCategoria(categoriaDeUrl());
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  const elegir = (evento, id) => {
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.button !== 0) return;
    evento.preventDefault();
    history.pushState(null, '', urlProgramas(id));
    setCategoria(id);
    window.scrollTo({ top: 0 });
  };

  const actual = CATEGORIAS.find((c) => c.id === categoria);
  const lista = categoria ? PROGRAMAS.filter((p) => p.categorias.includes(categoria)) : PROGRAMAS;

  useEffect(() => {
    const titulo = `${actual?.nombre ?? TITULO} — CAPSUR`;
    document.title = titulo;
    ponerMeta('name', 'description', actual?.descripcion ?? DESCRIPCION);
    ponerMeta('property', 'og:title', titulo);
    ponerMeta('property', 'og:description', actual?.descripcion ?? DESCRIPCION);
    ponerMeta('property', 'og:url', location.origin + urlProgramas(categoria));
    document
      .querySelector('link[rel="canonical"]')
      ?.setAttribute('href', location.origin + urlProgramas(categoria));
  }, [actual, categoria]);

  // Baja hasta el programa compartido cuando ya está pintado.
  useEffect(() => {
    if (destacado) {
      document.getElementById(`programa-${destacado}`)?.scrollIntoView({ block: 'center' });
    }
  }, [destacado]);

  return (
    <div className="pantalla">
      <Header actual={categoria} conInicio />

      <main id="programas" className="mx-auto w-full max-w-[100rem] flex-1 px-5 pt-4 pb-10 sm:px-8">
        <a href="/" className="volver" data-medir="Programas: volver al inicio">
          <IconoVolver className="size-4" />
          Volver al inicio
        </a>

        <h1 className="mt-3 text-center text-[24px] leading-tight font-extrabold text-navy-900 lg:text-[30px]">
          {actual?.nombre ?? TITULO}
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
          <a
            href={urlProgramas()}
            className="filtro"
            aria-current={categoria ? undefined : 'page'}
            onClick={(e) => elegir(e, null)}
          >
            Todos
          </a>
          {CATEGORIAS.map(({ id, nombre }) => (
            <a
              key={id}
              href={urlProgramas(id)}
              className="filtro"
              aria-current={categoria === id ? 'page' : undefined}
              data-medir={`Filtro: ${nombre}`}
              onClick={(e) => elegir(e, id)}
            >
              {nombre}
            </a>
          ))}
        </nav>

        <p className="mt-4 mb-4 text-center text-[13px] text-gris-texto" aria-live="polite">
          {lista.length} {lista.length === 1 ? 'institución' : 'instituciones'}
        </p>

        <Programas programas={lista} destacado={destacado} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: datosEstructurados(lista) }}
        />

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
