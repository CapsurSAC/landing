/**
 * Servidor simulado de los tres servicios internos para las pruebas e2e y las
 * capturas del panel. Responde con datos de ejemplo que se VALIDAN al arrancar
 * contra los esquemas de @capsur/api-contracts (si un contrato cambia, el mock
 * falla en vez de dar falsos positivos).
 *
 *   pnpm exec tsx e2e/mock-services.ts
 *
 * Puertos: promotions 4101, leads 4102, crm-bridge 4103 (MOCK_*_PORT).
 * Exige los mismos tokens Bearer que el panel en e2e (MOCK_*_TOKEN).
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  AdminComplaintSchema,
  AdminLeadSchema,
  AdminPrivacyRequestSchema,
  AdminPromotionInputSchema,
  AdminPromotionSchema,
  AdminSpecialtyInputSchema,
  AuditEntrySchema,
  DailyReportSchema,
  FunnelReportSchema,
  HealthSchema,
  IntegrationSummarySchema,
  type AdminComplaint,
  type AdminLead,
  type AdminPrivacyRequest,
  type AdminPromotion,
  type AdminSpecialtyInput,
  type AuditEntry,
} from '@capsur/api-contracts';
import { z } from 'zod';

const PORTS = {
  promotions: Number(process.env.MOCK_PROMOTIONS_PORT ?? 4101),
  leads: Number(process.env.MOCK_LEADS_PORT ?? 4102),
  crm: Number(process.env.MOCK_CRM_PORT ?? 4103),
};
const TOKENS = {
  promotions: process.env.MOCK_PROMOTIONS_TOKEN ?? 'e2e-admin-to-promotions',
  leads: process.env.MOCK_LEADS_TOKEN ?? 'e2e-admin-to-leads',
  crm: process.env.MOCK_CRM_TOKEN ?? 'e2e-admin-to-crm',
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

/* --------------------------------- datos ---------------------------------- */

const promotions: AdminPromotion[] = z.array(AdminPromotionSchema).parse([
  {
    id: 'con-ia',
    brand: 'sis',
    name: 'CON IA',
    headline: 'S/249',
    price: { amount: 24900, currency: 'PEN' },
    listPrice: { amount: 39900, currency: 'PEN' },
    bundle: { specialtiesIncluded: 1, allowedTracks: ['ia'], label: '1 especialidad' },
    featured: true,
    icon: 'layers',
    validFrom: iso(-30 * DAY),
    validUntil: iso(17 * DAY),
    campaignId: 'nov-2026',
    sortOrder: 1,
    active: true,
    createdAt: iso(-60 * DAY),
    updatedAt: iso(-2 * DAY),
  },
  {
    id: 'dos-por-uno',
    brand: 'sis',
    name: '2×1',
    headline: 'S/299',
    price: { amount: 29900, currency: 'PEN' },
    bundle: { specialtiesIncluded: 2, allowedTracks: ['ia', 'tradicional'], label: '2 especialidades' },
    featured: false,
    icon: 'gift',
    validFrom: iso(-30 * DAY),
    validUntil: null,
    campaignId: null,
    sortOrder: 2,
    active: true,
    createdAt: iso(-60 * DAY),
    updatedAt: iso(-10 * DAY),
  },
  {
    id: 'pack-ia-pro',
    brand: 'sis',
    name: 'PACK IA PRO',
    headline: 'S/449',
    price: { amount: 44900, currency: 'PEN' },
    bundle: { specialtiesIncluded: 2, allowedTracks: ['ia'], label: '2 especialidades IA' },
    featured: false,
    icon: 'stack',
    validFrom: iso(-30 * DAY),
    validUntil: iso(40 * DAY),
    campaignId: null,
    sortOrder: 3,
    active: true,
    createdAt: iso(-45 * DAY),
    updatedAt: iso(-5 * DAY),
  },
  {
    id: 'verano-2026',
    brand: 'sis',
    name: 'VERANO',
    headline: 'S/199',
    price: { amount: 19900, currency: 'PEN' },
    bundle: { specialtiesIncluded: 1, allowedTracks: ['tradicional'], label: '1 especialidad' },
    featured: false,
    icon: 'layers',
    validFrom: iso(-200 * DAY),
    validUntil: iso(-120 * DAY),
    campaignId: 'verano-2026',
    sortOrder: 9,
    active: false,
    createdAt: iso(-220 * DAY),
    updatedAt: iso(-120 * DAY),
  },
]);

const specialties: AdminSpecialtyInput[] = z.array(AdminSpecialtyInputSchema).parse([
  {
    id: 'analitica-datos-ia',
    brand: 'sis',
    name: 'Analítica de datos con IA',
    track: 'ia',
    summary: 'Limpieza, visualización y modelos predictivos con asistentes de IA.',
    audience: ['Egresados técnicos', 'Profesionales en actividad'],
    modality: '100% virtual',
    endorsedBy: 'Colegio de Ingenieros del Perú',
    sortOrder: 1,
    active: true,
  },
  {
    id: 'automatizacion-ia',
    brand: 'sis',
    name: 'Automatización de procesos con IA',
    track: 'ia',
    summary: 'Flujos de trabajo automáticos con herramientas no-code e IA generativa.',
    audience: ['Administración', 'Operaciones'],
    modality: '100% virtual',
    sortOrder: 2,
    active: true,
  },
  {
    id: 'redes-y-ciberseguridad',
    brand: 'sis',
    name: 'Redes y ciberseguridad',
    track: 'tradicional',
    summary: 'Configuración de redes, buenas prácticas y fundamentos de seguridad.',
    audience: [],
    modality: '100% virtual',
    sortOrder: 3,
    active: true,
  },
]);

const FIRST = ['Ana', 'Luis', 'María', 'Jorge', 'Rosa', 'Carlos', 'Lucía', 'Pedro', 'Elena', 'Diego'];
const LAST = ['Quispe', 'Mamani', 'Flores', 'Huamán', 'Rojas', 'Torres', 'Vargas', 'Chávez'];
const STATUSES = ['crm_synced', 'crm_synced', 'crm_synced', 'registered', 'crm_failed', 'crm_syncing'] as const;
const CAMPAIGNS = ['nov-2026', 'nov-2026', 'retargeting', '', 'tiktok-ia'];

const leads: AdminLead[] = z.array(AdminLeadSchema).parse(
  Array.from({ length: 42 }, (_, i) => {
    const promo = promotions[i % 3]!;
    const status = STATUSES[i % STATUSES.length]!;
    const campaign = CAMPAIGNS[i % CAMPAIGNS.length]!;
    const synced = status === 'crm_synced';
    const ref = `SIS-${(10_000 + i * 37).toString(36).toUpperCase().padStart(5, '0')}`;
    return {
      leadId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      reference: ref,
      brand: 'sis',
      createdAt: iso(-(i * 0.6) * DAY - 3_600_000),
      fullName: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]} ${LAST[(i + 3) % LAST.length]}`,
      phone: `+5195${String(1_000_000 + i * 7919).slice(-7)}`,
      email: `${FIRST[i % FIRST.length]!.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')}${i}@correo.pe`,
      campus: i % 4 === 0 ? 'arequipa' : 'tacna',
      promotion: { id: promo.id, name: promo.name, headline: promo.headline },
      specialtyIds: i % 3 === 1 ? ['analitica-datos-ia', 'redes-y-ciberseguridad'] : i % 2 === 0 ? ['analitica-datos-ia'] : [],
      status,
      crm: {
        contactId: synced ? String(500 + i) : null,
        conversationId: synced && i % 2 === 0 ? String(900 + i) : null,
        syncedAt: synced ? iso(-(i * 0.6) * DAY - 3_500_000) : null,
        conversationLinkedAt: synced && i % 2 === 0 ? iso(-(i * 0.6) * DAY - 3_000_000) : null,
      },
      attribution: campaign
        ? { utmSource: i % 2 ? 'facebook' : 'instagram', utmMedium: 'paid', utmCampaign: campaign, landingPath: '/', fbclid: `fb.${i}` }
        : null,
      consent: { marketingAccepted: i % 3 === 0, privacyVersion: '2026-11' },
      feedbackSource: (['facebook', 'instagram', 'tiktok', 'recomendacion', null] as const)[i % 5] ?? null,
      anonymized: false,
    };
  }),
);

const complaints: AdminComplaint[] = z.array(AdminComplaintSchema).parse([
  {
    complaintId: '10000000-0000-4000-8000-000000000001',
    code: 'SIS-LR-2026-000014',
    brand: 'sis',
    kind: 'reclamo',
    status: 'received',
    consumer: { fullName: 'Rosa Flores Rojas', documentType: 'DNI', documentNumber: '40123456', email: 'rosa@correo.pe', phone: '952000111' },
    itemDescription: 'Especialidad Analítica de datos con IA',
    detail: 'Pagué la matrícula y no recibí el acceso al aula virtual en la fecha indicada.',
    request: 'Solicito el acceso inmediato o la devolución del pago.',
    receivedAt: iso(-24 * DAY),
    responseDueBy: iso(-3 * DAY),
    response: null,
    respondedAt: null,
  },
  {
    complaintId: '10000000-0000-4000-8000-000000000002',
    code: 'SIS-LR-2026-000015',
    brand: 'sis',
    kind: 'queja',
    status: 'in_progress',
    consumer: { fullName: 'Jorge Huamán Torres', documentType: 'CE', documentNumber: 'X1234567', email: 'jorge@correo.pe', phone: '953111222' },
    itemDescription: 'Atención por WhatsApp',
    detail: 'Escribí tres veces y nadie respondió durante dos días.',
    request: 'Que mejoren los tiempos de respuesta.',
    receivedAt: iso(-18 * DAY),
    responseDueBy: iso(2 * DAY),
    response: null,
    respondedAt: null,
  },
  {
    complaintId: '10000000-0000-4000-8000-000000000003',
    code: 'SIS-LR-2026-000013',
    brand: 'sis',
    kind: 'reclamo',
    status: 'answered',
    consumer: { fullName: 'Elena Vargas Chávez', documentType: 'DNI', documentNumber: '70123456', email: 'elena@correo.pe', phone: '954222333' },
    itemDescription: 'Promoción 2×1',
    detail: 'Me cobraron el precio sin descuento.',
    request: 'Devolución de la diferencia.',
    receivedAt: iso(-30 * DAY),
    responseDueBy: iso(-9 * DAY),
    response: 'Se devolvió la diferencia el 3 de noviembre. Lamentamos las molestias.',
    respondedAt: iso(-12 * DAY),
  },
]);

const privacyRequests: AdminPrivacyRequest[] = z.array(AdminPrivacyRequestSchema).parse([
  {
    requestId: '20000000-0000-4000-8000-000000000001',
    code: 'SIS-ARCO-2026-000004',
    brand: 'sis',
    type: 'cancellation',
    status: 'received',
    fullName: 'Pedro Rojas Mamani',
    email: 'pedro@correo.pe',
    phone: null,
    reference: leads[5]!.reference,
    detail: 'Quiero que eliminen mis datos personales de su base.',
    receivedAt: iso(-5 * DAY),
    responseDueBy: iso(23 * DAY),
    resolution: null,
    resolvedAt: null,
  },
  {
    requestId: '20000000-0000-4000-8000-000000000002',
    code: 'SIS-ARCO-2026-000003',
    brand: 'sis',
    type: 'access',
    status: 'resolved',
    fullName: 'Lucía Torres Quispe',
    email: 'lucia@correo.pe',
    phone: '955333444',
    reference: null,
    detail: null,
    receivedAt: iso(-40 * DAY),
    responseDueBy: iso(-12 * DAY),
    resolution: 'Se envió por correo el detalle de los datos almacenados.',
    resolvedAt: iso(-20 * DAY),
  },
]);

const audits: Record<keyof typeof PORTS, AuditEntry[]> = {
  promotions: z.array(AuditEntrySchema).parse([
    { id: randomUUID(), at: iso(-2 * DAY), caller: 'admin-web', actor: 'admin@capsur.local', action: 'promotion.update', target: 'con-ia', metadata: { fields: ['price'] } },
  ]),
  leads: z.array(AuditEntrySchema).parse([
    { id: randomUUID(), at: iso(-1 * DAY), caller: 'admin-web', actor: 'admin@capsur.local', action: 'leads.export', target: null, metadata: { rows: 120 } },
    { id: randomUUID(), at: iso(-3 * DAY), caller: 'admin-web', actor: 'admin@capsur.local', action: 'complaint.respond', target: 'SIS-LR-2026-000013', metadata: null },
  ]),
  crm: z.array(AuditEntrySchema).parse([
    { id: randomUUID(), at: iso(-6 * 3_600_000), caller: 'ops', actor: null, action: 'integrations.retry', target: null, metadata: { attempted: 3, succeeded: 3 } },
  ]),
};

/* ------------------------------- utilidades ------------------------------- */

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json', ...headers });
  res.end(text);
}

const problem = (status: number, title: string, detail?: string) => ({ type: 'about:blank', title, status, detail });

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

function audit(service: keyof typeof PORTS, req: IncomingMessage, action: string, target: string | null, metadata: Record<string, unknown> | null = null) {
  audits[service].unshift({
    id: randomUUID(),
    at: new Date().toISOString(),
    caller: 'admin-web',
    actor: (req.headers['x-actor'] as string | undefined) ?? null,
    action,
    target,
    metadata,
  });
}

function paginate<T>(items: T[], url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length };
}

function filterLeads(url: URL): AdminLead[] {
  const p = url.searchParams;
  const q = p.get('q')?.trim().toLowerCase();
  return leads
    .filter((l) => !p.get('status') || l.status === p.get('status'))
    .filter((l) => !p.get('promotionId') || l.promotion.id === p.get('promotionId'))
    .filter((l) => !p.get('campus') || l.campus === p.get('campus'))
    .filter((l) => !p.get('utmCampaign') || l.attribution?.utmCampaign === p.get('utmCampaign'))
    .filter((l) => !p.get('from') || l.createdAt >= p.get('from')!)
    .filter((l) => !p.get('to') || l.createdAt <= p.get('to')!)
    .filter((l) => !q || l.reference.toLowerCase() === q || l.email === q || l.phone.replace(/\D/g, '').endsWith(q.replace(/\D/g, '') || '∅'))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function csv(rows: AdminLead[]): string {
  const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = 'referencia,fecha,nombre,telefono,correo,promocion,sede,estado';
  const lines = rows.map((l) => [l.reference, l.createdAt, l.fullName, l.phone, l.email, l.promotion.id, l.campus, l.status].map(esc).join(','));
  return `\uFEFF${[header, ...lines].join('\n')}\n`;
}

function health(service: string, status: 'ok' | 'degraded' | 'down', checks: Record<string, 'up' | 'down'>) {
  return HealthSchema.parse({ status, service, version: '2.0.0', checks, timestamp: new Date().toISOString() });
}

/* -------------------------------- servidores ------------------------------ */

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void;

function serve(name: keyof typeof PORTS, handler: Handler) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORTS[name]}`);
    try {
      if (url.pathname !== '/internal/health' && req.headers.authorization !== `Bearer ${TOKENS[name]}`) {
        return send(res, 401, problem(401, 'Unauthorized'));
      }
      await handler(req, res, url);
      if (!res.headersSent) send(res, 404, problem(404, 'Not Found'));
    } catch (err) {
      console.error(`[mock ${name}]`, err);
      if (!res.headersSent) send(res, 500, problem(500, 'Internal Server Error'));
    }
  });
  server.listen(PORTS[name], '127.0.0.1', () => console.log(`[mock] ${name} escuchando en http://127.0.0.1:${PORTS[name]}`));
  return server;
}

const servers = [
  serve('promotions', async (req, res, url) => {
    const { pathname } = url;
    if (req.method === 'GET' && pathname === '/internal/health') return send(res, 200, health('promotions-service', 'ok', { database: 'up' }));
    if (req.method === 'GET' && pathname === '/internal/admin/promotions') return send(res, 200, { items: promotions });
    if (req.method === 'POST' && pathname === '/internal/admin/promotions') {
      const parsed = AdminPromotionInputSchema.safeParse(await readJson(req));
      if (!parsed.success) return send(res, 400, { ...problem(400, 'Bad Request', 'Datos inválidos'), errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      if (promotions.some((p) => p.id === parsed.data.id)) return send(res, 409, problem(409, 'Conflict', 'Ya existe una promoción con ese id'));
      const created = AdminPromotionSchema.parse({ ...parsed.data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      promotions.push(created);
      audit('promotions', req, 'promotion.create', created.id);
      return send(res, 201, created);
    }
    const put = /^\/internal\/admin\/promotions\/([a-z0-9-]+)$/.exec(pathname);
    if (req.method === 'PUT' && put) {
      const idx = promotions.findIndex((p) => p.id === put[1]);
      if (idx < 0) return send(res, 404, problem(404, 'Not Found'));
      const parsed = AdminPromotionInputSchema.safeParse(await readJson(req));
      if (!parsed.success) return send(res, 400, problem(400, 'Bad Request'));
      promotions[idx] = AdminPromotionSchema.parse({ ...parsed.data, createdAt: promotions[idx]!.createdAt, updatedAt: new Date().toISOString() });
      audit('promotions', req, 'promotion.update', put[1]!);
      return send(res, 200, promotions[idx]);
    }
    const deact = /^\/internal\/admin\/promotions\/([a-z0-9-]+)\/deactivate$/.exec(pathname);
    if (req.method === 'POST' && deact) {
      const promo = promotions.find((p) => p.id === deact[1]);
      if (!promo) return send(res, 404, problem(404, 'Not Found'));
      promo.active = false;
      promo.updatedAt = new Date().toISOString();
      audit('promotions', req, 'promotion.deactivate', promo.id);
      return send(res, 200, promo);
    }
    if (req.method === 'GET' && pathname === '/internal/admin/specialties') return send(res, 200, { items: specialties });
    const spec = /^\/internal\/admin\/specialties\/([a-z0-9-]+)$/.exec(pathname);
    if (req.method === 'PUT' && spec) {
      const parsed = AdminSpecialtyInputSchema.safeParse(await readJson(req));
      if (!parsed.success) return send(res, 400, problem(400, 'Bad Request'));
      const idx = specialties.findIndex((s) => s.id === spec[1]);
      if (idx < 0) specialties.push(parsed.data);
      else specialties[idx] = parsed.data;
      audit('promotions', req, 'specialty.update', spec[1]!);
      return send(res, 200, parsed.data);
    }
    if (req.method === 'GET' && pathname === '/internal/admin/audit') return send(res, 200, { items: audits.promotions });
  }),

  serve('leads', async (req, res, url) => {
    const { pathname } = url;
    if (req.method === 'GET' && pathname === '/internal/health')
      return send(res, 200, health('leads-service', 'ok', { database: 'up', redis: 'up', rabbitmq: 'up' }));
    if (req.method === 'GET' && pathname === '/internal/admin/leads') return send(res, 200, paginate(filterLeads(url), url));
    if (req.method === 'GET' && pathname === '/internal/admin/leads.csv') {
      audit('leads', req, 'leads.export', null);
      return send(res, 200, csv(filterLeads(url).slice(0, 10_000)), { 'content-type': 'text/csv; charset=utf-8' });
    }
    const one = /^\/internal\/admin\/leads\/([0-9a-f-]{36})$/.exec(pathname);
    if (req.method === 'GET' && one) {
      const lead = leads.find((l) => l.leadId === one[1]);
      return lead ? send(res, 200, lead) : send(res, 404, problem(404, 'Not Found'));
    }
    const anon = /^\/internal\/admin\/leads\/([0-9a-f-]{36})\/anonymize$/.exec(pathname);
    if (req.method === 'POST' && anon) {
      const lead = leads.find((l) => l.leadId === anon[1]);
      if (!lead) return send(res, 404, problem(404, 'Not Found'));
      const body = z.object({ deleteCrmContact: z.boolean() }).parse(await readJson(req));
      Object.assign(lead, { fullName: '[anonimizado]', phone: '', email: '', attribution: null, anonymized: true });
      audit('leads', req, 'lead.anonymize', lead.reference, body);
      return send(res, 200, { leadId: lead.leadId, anonymized: true });
    }
    if (req.method === 'GET' && pathname === '/internal/admin/complaints') {
      const status = url.searchParams.get('status');
      return send(res, 200, paginate(complaints.filter((c) => !status || c.status === status), url));
    }
    const resp = /^\/internal\/admin\/complaints\/([0-9a-f-]{36})\/response$/.exec(pathname);
    if (req.method === 'POST' && resp) {
      const c = complaints.find((x) => x.complaintId === resp[1]);
      if (!c) return send(res, 404, problem(404, 'Not Found'));
      const body = z.object({ response: z.string().min(10) }).parse(await readJson(req));
      Object.assign(c, { response: body.response, respondedAt: new Date().toISOString(), status: 'answered' });
      audit('leads', req, 'complaint.respond', c.code);
      return send(res, 200, c);
    }
    if (req.method === 'GET' && pathname === '/internal/admin/privacy-requests') {
      const status = url.searchParams.get('status');
      return send(res, 200, paginate(privacyRequests.filter((r) => !status || r.status === status), url));
    }
    const resol = /^\/internal\/admin\/privacy-requests\/([0-9a-f-]{36})\/resolution$/.exec(pathname);
    if (req.method === 'POST' && resol) {
      const r = privacyRequests.find((x) => x.requestId === resol[1]);
      if (!r) return send(res, 404, problem(404, 'Not Found'));
      const body = z.object({ status: z.enum(['in_progress', 'resolved', 'rejected']), resolution: z.string(), anonymizeLeads: z.boolean() }).parse(await readJson(req));
      Object.assign(r, { status: body.status, resolution: body.resolution, resolvedAt: body.status === 'in_progress' ? null : new Date().toISOString() });
      audit('leads', req, 'privacy.resolve', r.code, { anonymizeLeads: body.anonymizeLeads });
      return send(res, 200, r);
    }
    if (req.method === 'GET' && pathname === '/internal/reports/funnel') {
      const from = url.searchParams.get('from')!;
      const to = url.searchParams.get('to')!;
      const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY));
      const k = days / 30;
      const report = FunnelReportSchema.parse({
        brand: 'sis',
        from,
        to,
        steps: [
          { key: 'landing_viewed', label: 'Visitas a la landing', count: Math.round(5400 * k) },
          { key: 'promotion_selected', label: 'Eligió promoción', count: Math.round(2100 * k) },
          { key: 'form_started', label: 'Empezó el formulario', count: Math.round(1180 * k) },
          { key: 'form_submitted', label: 'Envió el formulario', count: Math.round(640 * k) },
          { key: 'whatsapp_opened', label: 'Abrió WhatsApp', count: Math.round(512 * k) },
          { key: 'crm_synced', label: 'Sincronizado en CRM', count: Math.round(498 * k) },
          { key: 'conversation_linked', label: 'Conversación vinculada', count: Math.round(301 * k) },
        ],
        byPromotion: [
          { promotionId: 'con-ia', leads: Math.round(320 * k), synced: Math.round(312 * k), linked: Math.round(190 * k) },
          { promotionId: 'dos-por-uno', leads: Math.round(210 * k), synced: Math.round(201 * k), linked: Math.round(80 * k) },
          { promotionId: 'pack-ia-pro', leads: Math.round(110 * k), synced: Math.round(105 * k), linked: Math.round(31 * k) },
        ],
        byCampaign: [
          { utmCampaign: 'nov-2026', utmSource: 'facebook', leads: Math.round(280 * k) },
          { utmCampaign: 'tiktok-ia', utmSource: 'tiktok', leads: Math.round(150 * k) },
          { utmCampaign: 'retargeting', utmSource: 'instagram', leads: Math.round(90 * k) },
        ],
        byFeedbackSource: [
          { source: 'facebook', leads: Math.round(120 * k) },
          { source: 'tiktok', leads: Math.round(85 * k) },
          { source: 'recomendacion', leads: Math.round(40 * k) },
          { source: 'instagram', leads: Math.round(38 * k) },
        ],
        experiments: [
          { id: 'hero-copy', variant: 'control', exposures: Math.round(2700 * k), submissions: Math.round(300 * k) },
          { id: 'hero-copy', variant: 'beneficio', exposures: Math.round(2700 * k), submissions: Math.round(340 * k) },
        ],
        daily: Array.from({ length: days }, (_, i) => {
          const d = new Date(Date.parse(from) + i * DAY + 5 * 3_600_000).toISOString().slice(0, 10);
          return { date: d, leads: 14 + ((i * 7) % 15), duplicates: (i * 3) % 4 };
        }),
      });
      return send(res, 200, report);
    }
    if (req.method === 'GET' && pathname === '/internal/reports/daily') {
      return send(
        res,
        200,
        DailyReportSchema.parse({
          brand: 'sis',
          date: url.searchParams.get('date'),
          leads: 23,
          duplicates: 2,
          crmSynced: 20,
          crmFailed: 1,
          conversationsLinked: 12,
          topPromotion: 'con-ia',
          topCampaign: 'nov-2026',
        }),
      );
    }
    if (req.method === 'GET' && pathname === '/internal/admin/audit') return send(res, 200, { items: audits.leads });
  }),

  serve('crm', async (req, res, url) => {
    const { pathname } = url;
    if (req.method === 'GET' && pathname === '/internal/health')
      return send(res, 200, health('crm-bridge-service', 'degraded', { database: 'up', rabbitmq: 'up', chatwoot: 'down' }));
    if (req.method === 'GET' && pathname === '/internal/integrations/summary') {
      return send(
        res,
        200,
        IntegrationSummarySchema.parse({
          jobs: { pending: 2, succeeded: 1480, failed: 3, dead: 1 },
          queues: [
            { name: 'crm-bridge.lead-created', messages: 0, consumers: 1 },
            { name: 'crm-bridge.lead-created.retry', messages: 2, consumers: 0 },
            { name: 'crm-bridge.lead-created.dlq', messages: 1, consumers: 0 },
            { name: 'crm-bridge.lead-feedback', messages: 0, consumers: 1 },
            { name: 'crm-bridge.lead-anonymized', messages: 0, consumers: 1 },
            { name: 'crm-bridge.meta-capi', messages: 0, consumers: 1 },
          ],
          lastSyncAt: iso(-12 * 60_000),
          chatwootConfigured: true,
        }),
      );
    }
    if (req.method === 'POST' && pathname === '/internal/integrations/retry') {
      const body = z.object({ status: z.enum(['FAILED', 'DEAD']) }).parse(await readJson(req));
      const result = body.status === 'FAILED' ? { attempted: 3, succeeded: 2, failed: 1 } : { attempted: 1, succeeded: 1, failed: 0 };
      audit('crm', req, 'integrations.retry', null, { status: body.status, ...result });
      return send(res, 200, result);
    }
    if (req.method === 'GET' && pathname === '/internal/admin/audit') return send(res, 200, { items: audits.crm });
  }),
];

function shutdown() {
  for (const s of servers) s.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
