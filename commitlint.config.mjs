/**
 * Commits convencionales (B26). Ejemplos válidos:
 *   feat(web-sis): selector de especialidades
 *   fix(leads): validar Idempotency-Key como UUID
 *   chore(infra): colas de meta-capi en RabbitMQ
 * El alcance es opcional, pero si se indica debe ser uno de la lista.
 */
const scopes = [
  'web-sis',
  'admin-web',
  'promotions',
  'leads',
  'crm-bridge',
  'contracts',
  'nest-kit',
  'config',
  'infra',
  'docs',
  // Automatizaciones: Renovate (deps), workflows (ci) y changesets (release).
  'deps',
  'ci',
  'release',
];

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', scopes],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 120],
  },
  prompt: {
    questions: {
      scope: { description: `Alcance (${scopes.join(', ')})` },
    },
  },
};
