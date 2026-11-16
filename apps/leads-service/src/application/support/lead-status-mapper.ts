import type { LeadStatus as ContractLeadStatus } from '@capsur/api-contracts';
import type { LeadStatus } from '../../domain/lead';

const STATUS_MAP: Record<LeadStatus, ContractLeadStatus> = {
  REGISTERED: 'registered',
  CRM_SYNCING: 'crm_syncing',
  CRM_SYNCED: 'crm_synced',
  CRM_FAILED: 'crm_failed',
};

const REVERSE_STATUS_MAP: Record<ContractLeadStatus, LeadStatus> = {
  registered: 'REGISTERED',
  crm_syncing: 'CRM_SYNCING',
  crm_synced: 'CRM_SYNCED',
  crm_failed: 'CRM_FAILED',
};

/** Traduce el estado de dominio al valor público del contrato. */
export function toContractStatus(status: LeadStatus): ContractLeadStatus {
  return STATUS_MAP[status];
}

/** Traduce el valor público del contrato al estado de dominio (filtros del panel). */
export function fromContractStatus(status: ContractLeadStatus): LeadStatus {
  return REVERSE_STATUS_MAP[status];
}
