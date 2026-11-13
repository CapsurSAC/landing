import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import FormularioLead from './components/FormularioLead.jsx';
import Instituciones from './components/Instituciones.jsx';
import PorQueCapsur from './components/PorQueCapsur.jsx';
import Footer from './components/Footer.jsx';
import BotonFlotante from './components/BotonFlotante.jsx';

export default function App() {
  return (
      <div className="pantalla">
        <a
          href="#formulario"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-navy-900 focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
        >
          Saltar al formulario
        </a>

        <Header />

        <main className="flex-1">
          {/*
            El orden del HTML es portada → formulario → instituciones → motivos,
            que es como conviene leerlo en móvil y también el orden de tabulación.
            En pantallas grandes el formulario ocupa la columna derecha.
          */}
          <div className="mx-auto grid w-full max-w-[100rem] grid-cols-1 gap-5 px-5 py-5 sm:px-8 lg:grid-cols-12 lg:items-start lg:gap-x-7">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
              <Hero />
              <Instituciones />
              <PorQueCapsur />
            </div>

            <div id="formulario" className="min-w-0 lg:col-span-4">
              <FormularioLead />
            </div>
          </div>
        </main>

        <Footer />
        <BotonFlotante />
      </div>
  );
}
