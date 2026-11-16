# ADR 0009 · Cifrado de datos personales en la aplicación

**Estado:** aceptada · 2026-11-13

## Contexto

leads-service guarda nombre, teléfono y correo de personas interesadas; crm-bridge guarda temporalmente el mismo payload para reintentos. La Ley N.º 29733 y su reglamento exigen medidas de seguridad proporcionales. Un volcado de la base, una copia de seguridad mal custodiada o un acceso indebido con el rol de lectura no deberían revelar datos personales. A la vez necesitamos detectar duplicados y buscar por teléfono o correo.

Opciones consideradas: `pgcrypto` en Postgres (la clave viaja en cada consulta y aparece en logs de sentencias), cifrado de disco (no protege frente a quien tiene credenciales SQL) y cifrado en la aplicación.

## Decisión

- **Cifrado en la aplicación** con AES-256-GCM (`PiiCipher` de `@capsur/nest-kit`). Formato `v1.<iv>.<tag>.<ciphertext>` en base64url; IV aleatorio de 96 bits por valor. Clave `PII_ENCRYPTION_KEY` (32 bytes en base64), distinta por entorno.
- leads-service cifra `fullName`, `phoneE164` y `email`; crm-bridge cifra el `payload` de `sync_jobs`.
- **Búsqueda y duplicados** con `hmacHash(value, PII_HASH_KEY)` (HMAC-SHA256) en columnas `phone_hash` y `email_hash`. Un hash sin clave no permite ataques de diccionario sobre teléfonos (espacio pequeño).
- **No** se instala la extensión `pgcrypto`.
- Los datos se descifran solo en las rutas que los necesitan (`/internal/admin/leads*`, envío a Chatwoot y Meta CAPI con hash propio de Meta), y los logs redactan los campos personales (nest-kit).
- El prefijo `v1.` permite rotar claves: una clave nueva escribe `v2.`, la lectura acepta ambas y un job re-cifra en segundo plano.

## Consecuencias

- Las copias de seguridad cifradas (C25) contienen además los datos ya cifrados: doble barrera.
- Perder `PII_ENCRYPTION_KEY` hace irrecuperables los datos: la clave se guarda en el gestor de secretos con copia en la bóveda offline (docs/security/secrets.md).
- No se puede filtrar por nombre en SQL; las búsquedas del panel usan los hashes exactos de teléfono/correo o filtros no personales (fecha, promoción, estado).
- Las claves de desarrollo de la spec están documentadas y permitidas en gitleaks; nunca deben usarse fuera de local.
