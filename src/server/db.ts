import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Base de datos de leads: un archivo SQLite (módulo incorporado de Node, sin
 * dependencias). Vive en DATA_DIR (por defecto ./data), que en producción debe
 * ser un disco persistente.
 */

export const LEAD_STATUSES = ['nuevo', 'contactado', 'matriculado', 'descartado'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadRow {
  id: number;
  createdAt: string;
  fullName: string;
  phoneCountry: string;
  phone: string;
  email: string;
  campus: string;
  promotionId: string;
  promotionName: string;
  specialties: string[];
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  referrer: string;
  status: LeadStatus;
  /** Cuándo pulsó «Recibir catálogo por WhatsApp»; null = dejó el formulario a medias. */
  whatsappSentAt: string | null;
  updatedAt: string;
}

export type NewLead = Omit<LeadRow, 'id' | 'createdAt' | 'status' | 'whatsappSentAt' | 'updatedAt'>;

let db: DatabaseSync | null = null;

function open(): DatabaseSync {
  if (db) return db;
  // La carpeta se decide al ejecutar (DATA_DIR); no hay nada que empaquetar en el build.
  const dir = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? 'data');
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, 'landing.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone_country TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      campus TEXT NOT NULL,
      promotion_id TEXT NOT NULL,
      promotion_name TEXT NOT NULL,
      specialties TEXT NOT NULL,
      utm_source TEXT NOT NULL DEFAULT '',
      utm_medium TEXT NOT NULL DEFAULT '',
      utm_campaign TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'nuevo'
    );
    CREATE INDEX IF NOT EXISTS leads_created_at ON leads (created_at);
  `);
  // Migración: columnas añadidas después de la primera versión.
  const columns = new Set((db.prepare('PRAGMA table_info(leads)').all() as Array<{ name: string }>).map((c) => c.name));
  if (!columns.has('client_key')) db.exec('ALTER TABLE leads ADD COLUMN client_key TEXT');
  if (!columns.has('whatsapp_sent_at')) db.exec('ALTER TABLE leads ADD COLUMN whatsapp_sent_at TEXT');
  if (!columns.has('updated_at')) db.exec('ALTER TABLE leads ADD COLUMN updated_at TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS leads_client_key ON leads (client_key)');
  return db;
}

interface DbLead {
  id: number;
  created_at: string;
  full_name: string;
  phone_country: string;
  phone: string;
  email: string;
  campus: string;
  promotion_id: string;
  promotion_name: string;
  specialties: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  referrer: string;
  status: string;
  whatsapp_sent_at: string | null;
  updated_at: string | null;
}

function toRow(r: DbLead): LeadRow {
  let specialties: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.specialties);
    if (Array.isArray(parsed)) specialties = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    // dato corrupto: se muestra sin especialidades
  }
  return {
    id: r.id,
    createdAt: r.created_at,
    fullName: r.full_name,
    phoneCountry: r.phone_country,
    phone: r.phone,
    email: r.email,
    campus: r.campus,
    promotionId: r.promotion_id,
    promotionName: r.promotion_name,
    specialties,
    utmSource: r.utm_source,
    utmMedium: r.utm_medium,
    utmCampaign: r.utm_campaign,
    referrer: r.referrer,
    status: (LEAD_STATUSES as readonly string[]).includes(r.status) ? (r.status as LeadStatus) : 'nuevo',
    whatsappSentAt: r.whatsapp_sent_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}

/**
 * Crea o actualiza el lead de un navegador (clientKey). Se llama mientras la
 * persona escribe y al pulsar WhatsApp; una vez enviado, el envío no se pierde
 * con actualizaciones posteriores y el estado del panel nunca se toca.
 */
export function upsertLead(clientKey: string, lead: NewLead, whatsappSent: boolean, now: Date = new Date()): void {
  const at = now.toISOString();
  open()
    .prepare(
      `INSERT INTO leads (client_key, created_at, updated_at, whatsapp_sent_at, full_name, phone_country, phone, email, campus,
         promotion_id, promotion_name, specialties, utm_source, utm_medium, utm_campaign, referrer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (client_key) DO UPDATE SET
         updated_at = excluded.updated_at,
         whatsapp_sent_at = COALESCE(leads.whatsapp_sent_at, excluded.whatsapp_sent_at),
         full_name = excluded.full_name, phone_country = excluded.phone_country, phone = excluded.phone,
         email = excluded.email, campus = excluded.campus, promotion_id = excluded.promotion_id,
         promotion_name = excluded.promotion_name, specialties = excluded.specialties,
         utm_source = CASE WHEN excluded.utm_source <> '' THEN excluded.utm_source ELSE leads.utm_source END,
         utm_medium = CASE WHEN excluded.utm_medium <> '' THEN excluded.utm_medium ELSE leads.utm_medium END,
         utm_campaign = CASE WHEN excluded.utm_campaign <> '' THEN excluded.utm_campaign ELSE leads.utm_campaign END,
         referrer = CASE WHEN excluded.referrer <> '' THEN excluded.referrer ELSE leads.referrer END`,
    )
    .run(
      clientKey,
      at,
      at,
      whatsappSent ? at : null,
      lead.fullName,
      lead.phoneCountry,
      lead.phone,
      lead.email,
      lead.campus,
      lead.promotionId,
      lead.promotionName,
      JSON.stringify(lead.specialties),
      lead.utmSource,
      lead.utmMedium,
      lead.utmCampaign,
      lead.referrer,
    );
}

export interface LeadFilters {
  q?: string;
  promotionId?: string;
  specialty?: string;
  status?: string;
  /** 'si' = pulsó WhatsApp, 'no' = lo dejó a medias. */
  whatsapp?: string;
  /** YYYY-MM-DD (día de Lima, incluido). */
  from?: string;
  /** YYYY-MM-DD (día de Lima, incluido). */
  to?: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Inicio del día civil de Lima (UTC-5) en ISO UTC. */
function limaDayStart(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000-05:00`)).toISOString();
}

export function listLeads(filters: LeadFilters = {}, limit = 1000): LeadRow[] {
  const where: string[] = [];
  const params: string[] = [];
  const q = filters.q?.trim();
  if (q) {
    where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
    const like = `%${q.replace(/[%_]/g, '')}%`;
    params.push(like, like, like);
  }
  if (filters.promotionId) {
    where.push('promotion_id = ?');
    params.push(filters.promotionId);
  }
  if (filters.specialty) {
    // Coincidencia exacta dentro del arreglo JSON.
    where.push('EXISTS (SELECT 1 FROM json_each(leads.specialties) WHERE value = ?)');
    params.push(filters.specialty);
  }
  if (filters.status && (LEAD_STATUSES as readonly string[]).includes(filters.status)) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.whatsapp === 'si') where.push('whatsapp_sent_at IS NOT NULL');
  if (filters.whatsapp === 'no') where.push('whatsapp_sent_at IS NULL');
  if (filters.from && ISO_DAY.test(filters.from)) {
    where.push('created_at >= ?');
    params.push(limaDayStart(filters.from));
  }
  if (filters.to && ISO_DAY.test(filters.to)) {
    const next = new Date(Date.parse(limaDayStart(filters.to)) + 24 * 60 * 60 * 1000).toISOString();
    where.push('created_at < ?');
    params.push(next);
  }
  const sql = `SELECT * FROM leads ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ${Math.max(1, Math.floor(limit))}`;
  return (open().prepare(sql).all(...params) as unknown as DbLead[]).map(toRow);
}

export function updateLeadStatus(id: number, status: LeadStatus): void {
  open().prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, id);
}

export interface LeadStats {
  total: number;
  /** Dejaron el formulario sin pulsar WhatsApp. */
  abandoned: number;
  unattended: number;
  today: number;
  last7Days: number;
  topSpecialty: { name: string; count: number } | null;
  topPromotion: { name: string; count: number } | null;
}

export function leadStats(now: Date = new Date()): LeadStats {
  const d = open();
  const count = (sql: string, ...params: string[]) => Number((d.prepare(sql).get(...params) as { n: number }).n);
  const todayLima = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayStart = limaDayStart(todayLima);
  const weekStart = new Date(Date.parse(todayStart) - 6 * 24 * 60 * 60 * 1000).toISOString();
  const topSpecialty = d
    .prepare(
      `SELECT value AS name, COUNT(*) AS n FROM leads, json_each(leads.specialties) GROUP BY value ORDER BY n DESC, value LIMIT 1`,
    )
    .get() as { name: string; n: number } | undefined;
  const topPromotion = d
    .prepare(`SELECT promotion_name AS name, COUNT(*) AS n FROM leads GROUP BY promotion_name ORDER BY n DESC, name LIMIT 1`)
    .get() as { name: string; n: number } | undefined;
  return {
    total: count('SELECT COUNT(*) AS n FROM leads'),
    abandoned: count('SELECT COUNT(*) AS n FROM leads WHERE whatsapp_sent_at IS NULL'),
    unattended: count(`SELECT COUNT(*) AS n FROM leads WHERE status = 'nuevo'`),
    today: count('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?', todayStart),
    last7Days: count('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?', weekStart),
    topSpecialty: topSpecialty ? { name: topSpecialty.name, count: Number(topSpecialty.n) } : null,
    topPromotion: topPromotion ? { name: topPromotion.name, count: Number(topPromotion.n) } : null,
  };
}
