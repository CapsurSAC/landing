import { formatComplianceCode } from './compliance';
import { FeedbackAlreadySubmittedError } from './errors';
import { ANONYMIZED_NAME, Lead } from './lead';
import { addBusinessDays, isIsoDate, limaDateOf, limaDayRange, msUntilNextLimaHour, previousIsoDate } from './lima-calendar';
import { leadFixture } from '../../test/support/fakes';

describe('lima-calendar', () => {
  it('fecha civil de Lima (UTC-5)', () => {
    expect(limaDateOf(new Date('2026-11-14T04:59:59.000Z'))).toBe('2026-11-13');
    expect(limaDateOf(new Date('2026-11-14T05:00:00.000Z'))).toBe('2026-11-14');
  });

  it('rango UTC de un día de Lima', () => {
    expect(limaDayRange('2026-11-13')).toEqual({
      from: new Date('2026-11-13T05:00:00.000Z'),
      to: new Date('2026-11-14T05:00:00.000Z'),
    });
    expect(() => limaDayRange('2026-02-30')).toThrow();
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(previousIsoDate('2026-03-01')).toBe('2026-02-28');
  });

  it('15 días hábiles desde el viernes 13/11/2026 → viernes 4/12/2026 (misma hora)', () => {
    const received = new Date('2026-11-13T15:00:00.000Z');
    expect(addBusinessDays(received, 15, new Set())).toEqual(new Date('2026-12-04T15:00:00.000Z'));
  });

  it('salta fines de semana y feriados', () => {
    const received = new Date('2026-12-04T15:00:00.000Z'); // viernes
    // Lunes 7, (martes 8 feriado), miércoles 9 → 2 días hábiles
    expect(addBusinessDays(received, 2, new Set(['2026-12-08']))).toEqual(new Date('2026-12-09T15:00:00.000Z'));
  });

  it('20 días hábiles con los feriados de diciembre', () => {
    const received = new Date('2026-12-01T14:00:00.000Z'); // martes
    const due = addBusinessDays(received, 20, new Set(['2026-12-08', '2026-12-09', '2026-12-25', '2027-01-01']));
    expect(limaDateOf(due)).toBe('2027-01-04');
  });

  it('milisegundos hasta la próxima hora de Lima', () => {
    // 07:00 en Lima → 08:00 en Lima = 1 h
    expect(msUntilNextLimaHour(new Date('2026-11-13T12:00:00.000Z'), 8)).toBe(60 * 60 * 1000);
    // 09:00 en Lima → mañana 08:00 = 23 h
    expect(msUntilNextLimaHour(new Date('2026-11-13T14:00:00.000Z'), 8)).toBe(23 * 60 * 60 * 1000);
  });
});

describe('formatComplianceCode', () => {
  it('SIS-LR-<año>-<6 dígitos> y SIS-ARCO-…', () => {
    expect(formatComplianceCode('sis', 'LR', 2026, 123)).toBe('SIS-LR-2026-000123');
    expect(formatComplianceCode('SIS', 'ARCO', 2026, 45)).toBe('SIS-ARCO-2026-000045');
    expect(() => formatComplianceCode('SIS', 'LR', 2026, 0)).toThrow();
    expect(() => formatComplianceCode('SIS', 'LR', 2026, 1_000_000)).toThrow();
  });
});

describe('Lead', () => {
  const now = new Date('2026-11-14T10:00:00.000Z');

  it('acepta una sola respuesta de la encuesta (A21)', () => {
    const lead = Lead.fromProps(leadFixture());
    lead.recordFeedback('instagram', 'Un reel', now);
    expect(lead.toProps().feedback).toEqual({ source: 'instagram', detail: 'Un reel', receivedAt: now });
    expect(() => lead.recordFeedback('google', null, now)).toThrow(FeedbackAlreadySubmittedError);
  });

  it('guarda el nombre del asesor al enlazar la conversación', () => {
    const lead = Lead.fromProps(leadFixture({ status: 'CRM_SYNCING' }));
    lead.linkCrmConversation({ crmContactId: 'c1', crmConversationId: 'v1', advisorName: 'Lucía', linkedAt: now, now });
    expect(lead.toProps()).toMatchObject({ status: 'CRM_SYNCED', crmAdvisorName: 'Lucía', crmSyncedAt: now });
  });

  it('anonimiza una sola vez (C9)', () => {
    const lead = Lead.fromProps(leadFixture({ feedback: { source: 'otro', detail: 'texto libre', receivedAt: now } }));
    expect(lead.anonymize(now)).toBe(true);
    expect(lead.toProps()).toMatchObject({
      fullName: ANONYMIZED_NAME,
      phoneE164: '',
      email: '',
      phoneHash: null,
      emailHash: null,
      feedback: { source: 'otro', detail: null },
      anonymizedAt: now,
    });
    expect(lead.anonymize(now)).toBe(false);
  });
});
