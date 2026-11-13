import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const urlSitio = (env.VITE_URL_SITIO || '').replace(/\/+$/, '');

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Vite deja %VITE_X% tal cual si la variable no existe; esto garantiza
        // que og:image quede relativa en vez de romperse.
        name: 'url-sitio-en-html',
        transformIndexHtml: (html) => html.replaceAll('%VITE_URL_SITIO%', urlSitio),
      },
    ],

  // Rutas relativas en el build: así la carpeta dist/ funciona tanto en la raíz
  // del dominio como dentro de un subdirectorio de cPanel.
  base: './',

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Dos páginas: el inicio con el formulario y el detalle de programas.
    rollupOptions: {
      input: {
        inicio: fileURLToPath(new URL('./index.html', import.meta.url)),
        programas: fileURLToPath(new URL('./programas.html', import.meta.url)),
      },
    },
  },

  server: {
    port: 5173,
    // Durante el desarrollo, redirige /api al PHP local.
    // Levanta el PHP aparte con:  php -S localhost:8000 -t server
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  };
});
