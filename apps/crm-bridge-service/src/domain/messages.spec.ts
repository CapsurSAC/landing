import { leadCreatedPayload } from '../../test/fakes/support';
import { buildAutoReplyMessage } from './auto-reply';
import { buildFollowupTemplateMessage, FOLLOWUP_TEMPLATE_CATEGORY } from './followup-template';
import { buildLeadLabels, firstName } from './lead-labels';

describe('mensajes y etiquetas', () => {
  it('respuesta automática completa (A8)', () => {
    const text = buildAutoReplyMessage({
      firstName: 'María',
      promotionName: 'Con IA',
      reference: 'SIS-7K3M2',
      catalogUrl: 'https://sis.edu.pe/c.pdf',
      agentName: 'Ana',
    });
    expect(text).toBe(
      '¡Hola, María! Recibimos tu solicitud SIS-7K3M2 para la promoción «Con IA».\n' +
        'Aquí tienes el catálogo: https://sis.edu.pe/c.pdf\n' +
        'Te atenderá Ana, tu asesor(a) asignado(a), en breve.',
    );
  });

  it('plantilla de seguimiento (A6): categoría UTILITY y tres parámetros', () => {
    const message = buildFollowupTemplateMessage(leadCreatedPayload(), { name: 'sis_catalogo_seguimiento', language: 'es' });
    expect(message.templateParams).toEqual({
      name: 'sis_catalogo_seguimiento',
      category: FOLLOWUP_TEMPLATE_CATEGORY,
      language: 'es',
      processedParams: { '1': 'María', '2': 'Computación e Informática con IA', '3': 'SIS-7K3M2' },
    });
    expect(message.content).toContain('SIS-7K3M2');
  });

  it('etiqueta de sede y nombre de pila', () => {
    expect(buildLeadLabels(leadCreatedPayload({ campus: 'arequipa' }))).toContain('sede-arequipa');
    expect(firstName('  María   Quispe ')).toBe('María');
    expect(firstName('')).toBe('');
  });
});
