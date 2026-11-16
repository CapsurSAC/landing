import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import type {
  DailyAggregates,
  FunnelAggregates,
  ReportRange,
  ReportRepository,
} from '../../application/ports/report-repository';
import { PrismaService } from './prisma.service';

/** Eventos de tracking que forman parte del embudo. */
export const FUNNEL_TRACKING_EVENTS = [
  'landing_viewed',
  'promotion_selected',
  'form_started',
  'form_submitted',
  'whatsapp_opened',
] as const;

type Countable = number | bigint | null;

function toInt(value: Countable): number {
  return value === null ? 0 : Number(value);
}

/**
 * Consultas de reportes (A16, A20) con SQL explícito y agregaciones en la
 * base. Revisadas con EXPLAIN (B29): ver README, «Consultas e índices».
 */
@Injectable()
export class PrismaReportRepository implements ReportRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async funnel(range: ReportRange): Promise<FunnelAggregates> {
    const { brand, from, to } = range;
    const [sessions, crm, byPromotion, byCampaign, byFeedback, exposures, submissions, daily] = await Promise.all([
      this.prisma.$queryRaw<Array<{ event: string; sessions: Countable }>>(Prisma.sql`
        SELECT event, COUNT(DISTINCT session_id) AS sessions
        FROM tracking_events
        WHERE brand = ${brand} AND occurred_at >= ${from} AND occurred_at < ${to}
          AND event IN (${Prisma.join([...FUNNEL_TRACKING_EVENTS])})
        GROUP BY event
      `),
      this.prisma.$queryRaw<Array<{ synced: Countable; linked: Countable }>>(Prisma.sql`
        SELECT COUNT(crm_synced_at) AS synced, COUNT(crm_conversation_linked_at) AS linked
        FROM leads
        WHERE brand = ${brand} AND created_at >= ${from} AND created_at < ${to}
      `),
      this.prisma.$queryRaw<Array<{ promotion_id: string; leads: Countable; synced: Countable; linked: Countable }>>(Prisma.sql`
        SELECT promotion_id, COUNT(*) AS leads, COUNT(crm_synced_at) AS synced,
               COUNT(crm_conversation_linked_at) AS linked
        FROM leads
        WHERE brand = ${brand} AND created_at >= ${from} AND created_at < ${to}
        GROUP BY promotion_id
        ORDER BY leads DESC, promotion_id ASC
      `),
      this.prisma.$queryRaw<Array<{ utm_campaign: string; utm_source: string | null; leads: Countable }>>(Prisma.sql`
        SELECT a.utm_campaign, a.utm_source, COUNT(*) AS leads
        FROM leads l
        JOIN lead_attributions a ON a.lead_id = l.id
        WHERE l.brand = ${brand} AND l.created_at >= ${from} AND l.created_at < ${to}
          AND a.utm_campaign IS NOT NULL
        GROUP BY a.utm_campaign, a.utm_source
        ORDER BY leads DESC, a.utm_campaign ASC
        LIMIT 100
      `),
      this.prisma.$queryRaw<Array<{ source: string; leads: Countable }>>(Prisma.sql`
        SELECT feedback_source AS source, COUNT(*) AS leads
        FROM leads
        WHERE brand = ${brand} AND created_at >= ${from} AND created_at < ${to}
          AND feedback_source IS NOT NULL
        GROUP BY feedback_source
        ORDER BY leads DESC, feedback_source ASC
      `),
      this.prisma.$queryRaw<Array<{ id: string; variant: string; sessions: Countable }>>(Prisma.sql`
        SELECT experiment_id AS id, experiment_variant AS variant, COUNT(DISTINCT session_id) AS sessions
        FROM tracking_events
        WHERE brand = ${brand} AND event = 'experiment_exposed'
          AND occurred_at >= ${from} AND occurred_at < ${to}
          AND experiment_id IS NOT NULL AND experiment_variant IS NOT NULL
        GROUP BY experiment_id, experiment_variant
      `),
      this.prisma.$queryRaw<Array<{ id: string; variant: string; leads: Countable }>>(Prisma.sql`
        SELECT experiment_id AS id, experiment_variant AS variant, COUNT(*) AS leads
        FROM leads
        WHERE brand = ${brand} AND created_at >= ${from} AND created_at < ${to}
          AND experiment_id IS NOT NULL AND experiment_variant IS NOT NULL
        GROUP BY experiment_id, experiment_variant
      `),
      this.prisma.$queryRaw<Array<{ date: string; leads: Countable; duplicates: Countable }>>(Prisma.sql`
        SELECT to_char((s.created_at AT TIME ZONE 'America/Lima')::date, 'YYYY-MM-DD') AS date,
               COUNT(*) FILTER (WHERE s.outcome = 'CREATED') AS leads,
               COUNT(*) FILTER (WHERE s.outcome = 'DUPLICATE') AS duplicates
        FROM lead_submissions s
        JOIN leads l ON l.id = s.lead_id
        WHERE l.brand = ${brand} AND s.created_at >= ${from} AND s.created_at < ${to}
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    return {
      sessionsByEvent: Object.fromEntries(sessions.map((row) => [row.event, toInt(row.sessions)])),
      crmSynced: toInt(crm[0]?.synced ?? 0),
      conversationLinked: toInt(crm[0]?.linked ?? 0),
      byPromotion: byPromotion.map((row) => ({
        promotionId: row.promotion_id,
        leads: toInt(row.leads),
        synced: toInt(row.synced),
        linked: toInt(row.linked),
      })),
      byCampaign: byCampaign.map((row) => ({ utmCampaign: row.utm_campaign, utmSource: row.utm_source, leads: toInt(row.leads) })),
      byFeedbackSource: byFeedback.map((row) => ({ source: row.source, leads: toInt(row.leads) })),
      experimentExposures: exposures.map((row) => ({ id: row.id, variant: row.variant, sessions: toInt(row.sessions) })),
      experimentSubmissions: submissions.map((row) => ({ id: row.id, variant: row.variant, leads: toInt(row.leads) })),
      daily: daily.map((row) => ({ date: row.date, leads: toInt(row.leads), duplicates: toInt(row.duplicates) })),
    };
  }

  async daily(range: ReportRange): Promise<DailyAggregates> {
    const { brand, from, to } = range;
    const [submissions, crm, topPromotion, topCampaign] = await Promise.all([
      this.prisma.$queryRaw<Array<{ leads: Countable; duplicates: Countable }>>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE s.outcome = 'CREATED') AS leads,
               COUNT(*) FILTER (WHERE s.outcome = 'DUPLICATE') AS duplicates
        FROM lead_submissions s
        JOIN leads l ON l.id = s.lead_id
        WHERE l.brand = ${brand} AND s.created_at >= ${from} AND s.created_at < ${to}
      `),
      this.prisma.$queryRaw<Array<{ synced: Countable; failed: Countable; linked: Countable }>>(Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE brand = ${brand} AND crm_synced_at >= ${from} AND crm_synced_at < ${to}) AS synced,
          (SELECT COUNT(*) FROM leads WHERE brand = ${brand} AND status = 'CRM_FAILED' AND updated_at >= ${from} AND updated_at < ${to}) AS failed,
          (SELECT COUNT(*) FROM leads WHERE brand = ${brand} AND crm_conversation_linked_at >= ${from} AND crm_conversation_linked_at < ${to}) AS linked
      `),
      this.prisma.$queryRaw<Array<{ promotion_id: string }>>(Prisma.sql`
        SELECT promotion_id
        FROM leads
        WHERE brand = ${brand} AND created_at >= ${from} AND created_at < ${to}
        GROUP BY promotion_id
        ORDER BY COUNT(*) DESC, promotion_id ASC
        LIMIT 1
      `),
      this.prisma.$queryRaw<Array<{ utm_campaign: string }>>(Prisma.sql`
        SELECT a.utm_campaign
        FROM leads l
        JOIN lead_attributions a ON a.lead_id = l.id
        WHERE l.brand = ${brand} AND l.created_at >= ${from} AND l.created_at < ${to}
          AND a.utm_campaign IS NOT NULL
        GROUP BY a.utm_campaign
        ORDER BY COUNT(*) DESC, a.utm_campaign ASC
        LIMIT 1
      `),
    ]);
    return {
      leads: toInt(submissions[0]?.leads ?? 0),
      duplicates: toInt(submissions[0]?.duplicates ?? 0),
      crmSynced: toInt(crm[0]?.synced ?? 0),
      crmFailed: toInt(crm[0]?.failed ?? 0),
      conversationsLinked: toInt(crm[0]?.linked ?? 0),
      topPromotion: topPromotion[0]?.promotion_id ?? null,
      topCampaign: topCampaign[0]?.utm_campaign ?? null,
    };
  }
}
