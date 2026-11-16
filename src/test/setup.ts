import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library solo limpia automáticamente con `globals: true`; aquí se hace explícito.
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});
