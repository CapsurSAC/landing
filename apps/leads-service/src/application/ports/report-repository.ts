/** Rango semiabierto `[from, to)` de una marca. */
export interface ReportRange {
  brand: string;
  from: Date;
  to: Date;
}

/** Agregados crudos del embudo (A16); el caso de uso los ordena y etiqueta. */
export interface FunnelAggregates {
  /** Sesiones únicas por evento de tracking. */
  sessionsByEvent: Record<string, number>;
  /** Leads creados en el rango ya sincronizados con el CRM / con conversación enlazada. */
  crmSynced: number;
  conversationLinked: number;
  byPromotion: Array<{ promotionId: string; leads: number; synced: number; linked: number }>;
  byCampaign: Array<{ utmCampaign: string; utmSource: string | null; leads: number }>;
  byFeedbackSource: Array<{ source: string; leads: number }>;
  experimentExposures: Array<{ id: string; variant: string; sessions: number }>;
  experimentSubmissions: Array<{ id: string; variant: string; leads: number }>;
  /** Serie diaria (fecha de Lima) de envíos nuevos y duplicados desde `lead_submissions`. */
  daily: Array<{ date: string; leads: number; duplicates: number }>;
}

/** Agregados de un día (A20). */
export interface DailyAggregates {
  leads: number;
  duplicates: number;
  crmSynced: number;
  crmFailed: number;
  conversationsLinked: number;
  topPromotion: string | null;
  topCampaign: string | null;
}

export interface ReportRepository {
  funnel(range: ReportRange): Promise<FunnelAggregates>;
  daily(range: ReportRange): Promise<DailyAggregates>;
}

export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');
