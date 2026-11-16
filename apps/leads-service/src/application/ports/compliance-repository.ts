import type { ComplianceSequenceKind } from '../../domain/compliance';

/** Reclamo o queja del Libro de Reclamaciones (A5). Datos personales en claro (el repositorio cifra). */
export interface ComplaintProps {
  id: string;
  code: string;
  brand: string;
  kind: 'reclamo' | 'queja';
  status: 'received' | 'in_progress' | 'answered';
  consumer: {
    fullName: string;
    documentType: 'DNI' | 'CE' | 'PASAPORTE';
    documentNumber: string;
    address: string;
    phone: string;
    email: string;
    isMinor: boolean;
    guardianName: string | null;
  };
  emailHash: string;
  item: { type: 'producto' | 'servicio'; description: string; amount: number | null };
  detail: string;
  request: string;
  ipHash: string | null;
  receivedAt: Date;
  responseDueBy: Date;
  response: string | null;
  respondedAt: Date | null;
  respondedBy: string | null;
}

/** Solicitud de derechos ARCO (C9). */
export interface PrivacyRequestProps {
  id: string;
  code: string;
  brand: string;
  type: 'access' | 'rectification' | 'cancellation' | 'opposition' | 'revoke_consent';
  status: 'received' | 'in_progress' | 'resolved' | 'rejected';
  fullName: string;
  email: string;
  emailHash: string;
  phone: string | null;
  phoneHash: string | null;
  reference: string | null;
  detail: string | null;
  ipHash: string | null;
  receivedAt: Date;
  responseDueBy: Date;
  resolution: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

/** Fabrica el código a partir del correlativo reservado dentro de la transacción. */
export type CodeFactory = (sequence: number) => string;

export interface ListPage {
  offset: number;
  limit: number;
}

export interface ComplaintRepository {
  /**
   * Reserva el siguiente correlativo de (marca, LR, año) con bloqueo de fila y
   * crea el reclamo en la MISMA transacción: si algo falla no se consume el
   * número (sin huecos).
   */
  createWithSequence(
    input: Omit<ComplaintProps, 'code'>,
    sequence: { kind: ComplianceSequenceKind; year: number; code: CodeFactory },
  ): Promise<ComplaintProps>;
  findById(id: string): Promise<ComplaintProps | null>;
  list(filter: { brand?: string; status?: ComplaintProps['status'] }, page: ListPage): Promise<{ items: ComplaintProps[]; total: number }>;
  saveResponse(id: string, input: { response: string; respondedAt: Date; respondedBy: string | null }): Promise<void>;
}

export interface PrivacyRequestRepository {
  createWithSequence(
    input: Omit<PrivacyRequestProps, 'code'>,
    sequence: { kind: ComplianceSequenceKind; year: number; code: CodeFactory },
  ): Promise<PrivacyRequestProps>;
  findById(id: string): Promise<PrivacyRequestProps | null>;
  list(filter: { brand?: string; status?: PrivacyRequestProps['status'] }, page: ListPage): Promise<{ items: PrivacyRequestProps[]; total: number }>;
  saveResolution(
    id: string,
    input: { status: PrivacyRequestProps['status']; resolution: string; resolvedAt: Date | null; resolvedBy: string | null },
  ): Promise<void>;
}

export const COMPLAINT_REPOSITORY = Symbol('COMPLAINT_REPOSITORY');
export const PRIVACY_REQUEST_REPOSITORY = Symbol('PRIVACY_REQUEST_REPOSITORY');
