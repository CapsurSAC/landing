import { safeJsonForScript } from '@capsur/api-contracts';
import { getNonce } from '@/lib/nonce';

/**
 * Datos estructurados (JSON-LD). Lleva el nonce de la CSP (C1) y se serializa
 * con `safeJsonForScript` para que ningún valor pueda cerrar la etiqueta (C27).
 * Componente de servidor: el escape y el nonce nunca llegan al bundle cliente.
 */
export async function JsonLd({ data }: { data: unknown }) {
  const nonce = await getNonce();
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: safeJsonForScript(data) }} />;
}
