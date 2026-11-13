#!/usr/bin/env node
/**
 * Prueba de humo contra un sitio levantado (la imagen Docker o el dominio).
 *
 *   node scripts/prueba-humo.mjs http://localhost:8099
 *
 * Comprueba páginas, rutas que deben estar cerradas, cabeceras de seguridad,
 * las validaciones del envío y el ciclo de un posible. Crea un lead y un
 * posible de prueba: úsala contra producción solo si sabes que quedarán en el panel.
 * Sale con código 1 si algo falla.
 */
import { randomUUID } from 'node:crypto';

const BASE = (process.argv[2] || 'http://localhost:8099').replace(/\/+$/, '');
const ORIGEN = new URL(BASE).origin;
let fallos = 0;

const ok = (cond, texto, detalle = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${texto}${!cond && detalle ? ` → ${detalle}` : ''}`);
  if (!cond) fallos++;
};

const post = (ruta, cuerpo, { origen = ORIGEN, tipo = 'application/json' } = {}) =>
  fetch(BASE + ruta, {
    method: 'POST',
    headers: { 'Content-Type': tipo, ...(origen ? { Origin: origen } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });

const lead = (extra = {}) => ({
  nombre: 'Prueba de Humo',
  email: 'humo@ejemplo.com',
  whatsapp: '951234867',
  area: 'Computación e informática',
  objetivo: 'Todavía lo estoy evaluando',
  inicio: 'Solo estoy averiguando',
  consentimiento: true,
  marketing: false,
  version_consentimiento: 'prueba',
  envio_id: randomUUID(),
  area_codigo: 'COMP',
  pagina: `${BASE}/`,
  ...extra,
});

console.log(`Prueba de humo contra ${BASE}\n`);

console.log('Páginas');
for (const ruta of ['/', '/programas.html', '/programas', '/programas/capacitacion', '/libro-de-reclamaciones.html', '/politica-de-privacidad.html', '/robots.txt', '/sitemap.xml', '/admin/']) {
  const r = await fetch(BASE + ruta);
  ok(r.status === 200, `${ruta} responde 200`, r.status);
}

{
  const r = await fetch(`${BASE}/api/salud.php`);
  ok(r.status === 200, '/api/salud.php responde 200 (storage escribible)', r.status);
}

console.log('Panel sin sesión');
for (const ruta of ['/admin/posibles.php', '/admin/metricas.php', '/admin/datos.php']) {
  const r = await fetch(BASE + ruta, { redirect: 'manual' });
  ok(r.status === 303, `${ruta} manda a entrar (303)`, r.status);
}

console.log('Rutas cerradas');
for (const ruta of ['/api/prueba.php', '/admin/panel.php']) {
  const r = await fetch(BASE + ruta);
  ok(r.status === 403 || r.status === 404, `${ruta} no existe para la web`, r.status);
}
for (const ruta of ['/config/.env', '/config/reglas.json', '/storage/leads.csv', '/vendor/autoload.php']) {
  const r = await fetch(BASE + ruta);
  ok(r.status === 404, `${ruta} responde 404`, r.status);
}

console.log('Cabeceras');
{
  const r = await fetch(`${BASE}/`);
  const h = (n) => r.headers.get(n) || '';
  ok(h('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');
  ok(/script-src/.test(h('content-security-policy')), 'CSP con script-src', h('content-security-policy'));
  ok(!/php/i.test(h('x-powered-by')), 'no delata la versión de PHP');
}

console.log('Envío del formulario');
{
  let r = await post('/api/enviar.php', lead());
  ok(r.status === 200, 'un lead válido se acepta', r.status);
  r = await post('/api/enviar.php', lead({ whatsapp: '951234867123' }));
  ok(r.status === 422, 'celular de 12 dígitos: 422', r.status);
  r = await post('/api/enviar.php', lead({ whatsapp: '987654321' }));
  ok(r.status === 422, 'celular inventado: 422', r.status);
  r = await post('/api/enviar.php', lead({ email: 'humo@ejemplo' }));
  ok(r.status === 422, 'correo incompleto: 422', r.status);
  r = await post('/api/enviar.php', lead(), { origen: 'https://otro-sitio.com' });
  ok(r.status === 403, 'origen ajeno: 403', r.status);
  r = await post('/api/enviar.php', lead(), { origen: null });
  ok(r.status === 403, 'sin cabecera Origin: 403', r.status);
  r = await post('/api/enviar.php', `nombre=x`, { tipo: 'application/x-www-form-urlencoded' });
  ok(r.status === 415, 'formulario que no es JSON: 415', r.status);
  r = await fetch(`${BASE}/api/enviar.php`);
  ok(r.status === 405, 'GET: 405', r.status);
}

console.log('Posibles');
{
  const id = randomUUID();
  let r = await post('/api/posible.php', { id, consentimiento: true, nombre: 'Humo Posible' });
  ok(r.status === 200, 'con autorización se guarda', r.status);
  r = await post('/api/posible.php', { id, consentimiento: false });
  ok(r.status === 200, 'al retirar la autorización se borra', r.status);
  r = await post('/api/posible.php', { id: 'no-es-un-id', consentimiento: true, nombre: 'x' });
  ok(r.status === 422, 'id inválido: 422', r.status);
}

console.log('Libro de Reclamaciones');
{
  const r = await post('/api/reclamo.php', {
    nombre: 'Prueba de Humo', tipo_documento: 'DNI', documento: '12345678', domicilio: 'Av. Prueba 123, Tacna',
    telefono: '951234867', correo: 'humo@ejemplo.com', bien: 'Servicio', descripcion_bien: 'Curso de prueba',
    tipo: 'Reclamo', detalle: 'Detalle de prueba de humo.', pedido: 'Pedido de prueba.', consentimiento: true,
  });
  const cuerpo = await r.json().catch(() => ({}));
  ok(r.status === 200 && /^CAPSUR-\d{4}-\d{6}$/.test(cuerpo.numero ?? ''), 'una hoja válida recibe su número', `${r.status} ${cuerpo.numero}`);
  const malo = await post('/api/reclamo.php', { nombre: 'X' });
  ok(malo.status === 422, 'una hoja incompleta: 422', malo.status);
}

console.log(fallos ? `\n${fallos} comprobaciones fallaron.` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
