import type { Brand, DailyReport, FunnelReport, LeadFeedbackSource } from '@capsur/api-contracts';
import { limaDateOf, limaDayRange, previousIsoDate } from '../../domain/lima-calendar';
import type { Clock } from '../ports/clock';
import type { AppLogger } from '../ports/logger';
import type { DistributedLock, TeamNotifier } from '../ports/notifications';
import type { ReportRepository } from '../ports/report-repository';

type FunnelStepKey = FunnelReport['steps'][number]['key'];

/** Pasos del embudo en orden, con su etiqueta para el panel. */
export const FUNNEL_STEPS: ReadonlyArray<{ key: FunnelStepKey; label: string; source: 'tracking' | 'crm' }> = [
  { key: 'landing_viewed', label: 'Vieron la landing', source: 'tracking' },
  { key: 'promotion_selected', label: 'Eligieron promoción', source: 'tracking' },
  { key: 'form_started', label: 'Empezaron el formulario', source: 'tracking' },
  { key: 'form_submitted', label: 'Enviaron el formulario', source: 'tracking' },
  { key: 'whatsapp_opened', label: 'Abrieron WhatsApp', source: 'tracking' },
  { key: 'crm_synced', label: 'Sincronizados con el CRM', source: 'crm' },
  { key: 'conversation_linked', label: 'Conversación iniciada', source: 'crm' },
];

/**
 * Embudo (A16): sesiones únicas por paso desde `tracking_events`, pasos de CRM
 * desde `leads`, desgloses por promoción, campaña, origen declarado,
 * experimentos (exposiciones vs. envíos) y serie diaria con duplicados.
 */
export class BuildFunnelReport {
  constructor(private readonly reports: ReportRepository) {}

  async execute(query: { brand: Brand; from: string; to: string }): Promise<FunnelReport> {
    const aggregates = await this.reports.funnel({ brand: query.brand, from: new Date(query.from), to: new Date(query.to) });

    const steps = FUNNEL_STEPS.map((step) => {
      let count = aggregates.sessionsByEvent[step.key] ?? 0;
      if (step.key === 'crm_synced') {
        count = aggregates.crmSynced;
      } else if (step.key === 'conversation_linked') {
        count = aggregates.conversationLinked;
      }
      return { key: step.key, label: step.label, count };
    });

    const submissionsByVariant = new Map(
      aggregates.experimentSubmissions.map((row) => [`${row.id}\u0000${row.variant}`, row.leads]),
    );
    const variantKeys = new Set([
      ...aggregates.experimentExposures.map((row) => `${row.id}\u0000${row.variant}`),
      ...submissionsByVariant.keys(),
    ]);
    const exposuresByVariant = new Map(
      aggregates.experimentExposures.map((row) => [`${row.id}\u0000${row.variant}`, row.sessions]),
    );
    const experiments = [...variantKeys]
      .map((key) => {
        const [id = '', variant = ''] = key.split('\u0000');
        return {
          id,
          variant,
          exposures: exposuresByVariant.get(key) ?? 0,
          submissions: submissionsByVariant.get(key) ?? 0,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id) || a.variant.localeCompare(b.variant));

    return {
      brand: query.brand,
      from: new Date(query.from).toISOString(),
      to: new Date(query.to).toISOString(),
      steps,
      byPromotion: aggregates.byPromotion,
      byCampaign: aggregates.byCampaign,
      byFeedbackSource: aggregates.byFeedbackSource.map((row) => ({
        source: row.source as LeadFeedbackSource,
        leads: row.leads,
      })),
      experiments,
      daily: aggregates.daily,
    };
  }
}

/** Reporte de un día civil de Lima (A20). */
export class BuildDailyReport {
  constructor(private readonly reports: ReportRepository) {}

  async execute(brand: Brand, date: string): Promise<DailyReport> {
    const { from, to } = limaDayRange(date);
    const aggregates = await this.reports.daily({ brand, from, to });
    return { brand, date, ...aggregates };
  }
}

/** Texto compatible con Slack (mrkdwn sencillo) del reporte diario. */
export function formatDailyReportText(report: DailyReport, brandDisplayName: string): string {
  return [
    `*Reporte diario ${brandDisplayName}* · ${report.date} (hora de Lima)`,
    `• Leads nuevos: *${report.leads}*`,
    `• Duplicados (mismo teléfono y promoción en 24 h): ${report.duplicates}`,
    `• Sincronizados con el CRM: ${report.crmSynced}`,
    `• Sincronizaciones fallidas: ${report.crmFailed}`,
    `• Conversaciones de WhatsApp enlazadas: ${report.conversationsLinked}`,
    `• Promoción con más leads: ${report.topPromotion ?? '—'}`,
    `• Campaña con más leads: ${report.topCampaign ?? '—'}`,
  ].join('\n');
}

/**
 * Envía el resumen del día anterior al webhook del equipo (A20). Un candado
 * en Redis por fecha evita el doble envío cuando hay varias réplicas.
 */
export class SendDailyReport {
  constructor(
    private readonly deps: {
      buildDailyReport: BuildDailyReport;
      notifier: TeamNotifier;
      lock: DistributedLock;
      clock: Clock;
      logger: AppLogger;
      brand: Brand;
      brandDisplayName: string;
    },
  ) {}

  /** Devuelve `false` si otra réplica ya lo envió. */
  async execute(): Promise<boolean> {
    const date = previousIsoDate(limaDateOf(this.deps.clock.now()));
    const lockKey = `leads:lock:daily-report:${this.deps.brand}:${date}`;
    const acquired = await this.deps.lock.acquire(lockKey, 26 * 60 * 60 * 1000);
    if (!acquired) {
      this.deps.logger.info({ date }, 'Reporte diario ya enviado por otra réplica');
      return false;
    }
    try {
      const report = await this.deps.buildDailyReport.execute(this.deps.brand, date);
      await this.deps.notifier.postText(formatDailyReportText(report, this.deps.brandDisplayName));
      this.deps.logger.info({ date, leads: report.leads }, 'Reporte diario enviado');
      return true;
    } catch (error) {
      // Se libera para que un reintento (manual o de otra réplica) pueda enviarlo.
      await this.deps.lock.release(lockKey).catch(() => undefined);
      throw error;
    }
  }
}
