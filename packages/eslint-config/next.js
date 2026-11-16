import base from './base.js';
import globals from 'globals';

/** Frontend Next.js: añade globals de navegador; las reglas de React las aporta eslint-config-next en la app. */
export default [
  ...base,
  {
    languageOptions: { globals: { ...globals.browser } },
  },
];
