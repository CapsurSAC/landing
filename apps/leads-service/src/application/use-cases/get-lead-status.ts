import type { LeadStatusResponse } from '@capsur/api-contracts';
import { LeadNotFoundError } from '../../domain/errors';
import type { LeadRepository } from '../ports/lead-repository';
import type { LeadTokenSigner } from '../support/lead-token';
import { toContractStatus } from '../support/lead-status-mapper';

/**
 * Estado público del lead, sin datos personales (C18). Exige el `statusToken`
 * firmado: sin token, con token incorrecto o con un id inexistente la
 * respuesta es la misma (404) para no revelar qué ids existen.
 */
export class GetLeadStatus {
  constructor(
    private readonly leads: LeadRepository,
    private readonly tokens: LeadTokenSigner,
  ) {}

  async execute(leadId: string, token: string | null | undefined): Promise<LeadStatusResponse> {
    if (!this.tokens.verify(leadId, token)) {
      throw new LeadNotFoundError(leadId);
    }
    const lead = await this.leads.findById(leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    const props = lead.toProps();
    return {
      leadId: props.id,
      reference: props.reference,
      status: toContractStatus(props.status),
      crm: {
        syncedAt: props.crmSyncedAt ? props.crmSyncedAt.toISOString() : null,
        conversationLinked: props.crmConversationId !== null,
        advisorName: props.crmAdvisorName,
      },
      updatedAt: props.updatedAt.toISOString(),
    };
  }
}
