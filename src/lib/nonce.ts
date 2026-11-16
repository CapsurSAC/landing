import { headers } from 'next/headers';

/** Nonce CSP de la petición actual (lo genera src/proxy.ts). Solo en Server Components. */
export async function getNonce(): Promise<string | undefined> {
  return (await headers()).get('x-nonce') ?? undefined;
}
