import 'server-only';
import { BrandSchema, type Brand } from '@capsur/api-contracts';
import { z } from 'zod';

/**
 * Variables de entorno del servidor. Se leen de forma perezosa (en la primera
 * petición, no al importar) para que `next build` no exija secretos.
 */

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/\/+$/, '') : undefined))
  .pipe(z.url().optional());

const EnvSchema = z.object({
  ADMIN_BRAND: BrandSchema.default('sis'),
  PROMOTIONS_SERVICE_URL: z.url().default('http://localhost:3001'),
  LEADS_SERVICE_URL: z.url().default('http://localhost:3002'),
  CRM_BRIDGE_SERVICE_URL: z.url().default('http://localhost:3003'),
  PROMOTIONS_SERVICE_TOKEN: z.string().trim().default(''),
  LEADS_SERVICE_TOKEN: z.string().trim().default(''),
  CRM_BRIDGE_SERVICE_TOKEN: z.string().trim().default(''),
  SERVICE_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(8000),
  /** URL pública de Chatwoot y cuenta para construir enlaces al contacto/conversación (opcional). */
  CHATWOOT_APP_URL: optionalUrl,
  CHATWOOT_ACCOUNT_ID: z
    .string()
    .trim()
    .regex(/^\d*$/)
    .optional()
    .transform((v) => v || undefined),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración de admin-web inválida: ${detail}`);
  }
  cached = parsed.data;
  return cached;
}

export function brand(): Brand {
  return serverEnv().ADMIN_BRAND;
}

export function chatwootLinks(contactId: string | null, conversationId: string | null) {
  const { CHATWOOT_APP_URL: base, CHATWOOT_ACCOUNT_ID: account } = serverEnv();
  if (!base || !account) return { contact: null, conversation: null };
  const safe = (v: string | null) => (v && /^\d+$/.test(v) ? v : null);
  const contact = safe(contactId);
  const conversation = safe(conversationId);
  return {
    contact: contact ? `${base}/app/accounts/${account}/contacts/${contact}` : null,
    conversation: conversation ? `${base}/app/accounts/${account}/conversations/${conversation}` : null,
  };
}
