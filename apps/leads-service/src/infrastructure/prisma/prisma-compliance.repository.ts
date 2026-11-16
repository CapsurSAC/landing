import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import type {
  CodeFactory,
  ComplaintProps,
  ComplaintRepository,
  ListPage,
  PrivacyRequestProps,
  PrivacyRequestRepository,
} from '../../application/ports/compliance-repository';
import type { ComplianceSequenceKind } from '../../domain/compliance';
import { PII_CODEC, PiiCodec } from '../pii/pii-codec';
import { PrismaService } from './prisma.service';

/**
 * Reserva el siguiente correlativo de (marca, tipo, año). El `INSERT … ON
 * CONFLICT DO UPDATE` bloquea la fila hasta el final de la transacción: las
 * peticiones concurrentes esperan su turno y, si la transacción se revierte,
 * el incremento también (sin huecos).
 */
export async function nextComplianceSequence(
  tx: Prisma.TransactionClient,
  brand: string,
  kind: ComplianceSequenceKind,
  year: number,
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ last_value: number }>>(Prisma.sql`
    INSERT INTO compliance_sequences (brand, kind, year, last_value)
    VALUES (${brand}, ${kind}, ${year}, 1)
    ON CONFLICT (brand, kind, year)
    DO UPDATE SET last_value = compliance_sequences.last_value + 1
    RETURNING last_value
  `);
  const value = rows[0]?.last_value;
  if (value === undefined) {
    throw new Error('No se pudo reservar el correlativo');
  }
  return Number(value);
}

const COMPLAINT_SELECT = {
  id: true,
  code: true,
  brand: true,
  kind: true,
  status: true,
  fullName: true,
  documentType: true,
  documentNumber: true,
  address: true,
  phone: true,
  email: true,
  emailHash: true,
  isMinor: true,
  guardianName: true,
  itemType: true,
  itemDescription: true,
  itemAmount: true,
  detail: true,
  request: true,
  ipHash: true,
  receivedAt: true,
  responseDueBy: true,
  response: true,
  respondedAt: true,
  respondedBy: true,
} satisfies Prisma.ComplaintSelect;

type ComplaintRow = Prisma.ComplaintGetPayload<{ select: typeof COMPLAINT_SELECT }>;

@Injectable()
export class PrismaComplaintRepository implements ComplaintRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PII_CODEC) private readonly codec: PiiCodec,
  ) {}

  async createWithSequence(
    input: Omit<ComplaintProps, 'code'>,
    sequence: { kind: ComplianceSequenceKind; year: number; code: CodeFactory },
  ): Promise<ComplaintProps> {
    return this.prisma.$transaction(async (tx) => {
      const code = sequence.code(await nextComplianceSequence(tx, input.brand, sequence.kind, sequence.year));
      await tx.complaint.create({
        data: {
          id: input.id,
          code,
          brand: input.brand,
          kind: input.kind,
          status: input.status,
          fullName: this.codec.seal(input.consumer.fullName),
          documentType: input.consumer.documentType,
          documentNumber: this.codec.seal(input.consumer.documentNumber),
          address: this.codec.seal(input.consumer.address),
          phone: this.codec.seal(input.consumer.phone),
          email: this.codec.seal(input.consumer.email),
          emailHash: input.emailHash,
          isMinor: input.consumer.isMinor,
          guardianName: this.codec.sealNullable(input.consumer.guardianName),
          itemType: input.item.type,
          itemDescription: input.item.description,
          itemAmount: input.item.amount,
          detail: input.detail,
          request: input.request,
          ipHash: input.ipHash,
          receivedAt: input.receivedAt,
          responseDueBy: input.responseDueBy,
        },
        select: { id: true },
      });
      return { ...input, code };
    });
  }

  async findById(id: string): Promise<ComplaintProps | null> {
    const row = await this.prisma.complaint.findUnique({ where: { id }, select: COMPLAINT_SELECT });
    return row ? this.toProps(row) : null;
  }

  async list(
    filter: { brand?: string; status?: ComplaintProps['status'] },
    page: ListPage,
  ): Promise<{ items: ComplaintProps[]; total: number }> {
    const where: Prisma.ComplaintWhereInput = {
      ...(filter.brand ? { brand: filter.brand } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.complaint.count({ where }),
      this.prisma.complaint.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: page.offset,
        take: page.limit,
        select: COMPLAINT_SELECT,
      }),
    ]);
    return { items: rows.map((row) => this.toProps(row)), total };
  }

  async saveResponse(id: string, input: { response: string; respondedAt: Date; respondedBy: string | null }): Promise<void> {
    await this.prisma.complaint.update({
      where: { id },
      data: { status: 'answered', response: input.response, respondedAt: input.respondedAt, respondedBy: input.respondedBy },
      select: { id: true },
    });
  }

  private toProps(row: ComplaintRow): ComplaintProps {
    return {
      id: row.id,
      code: row.code,
      brand: row.brand,
      kind: row.kind as ComplaintProps['kind'],
      status: row.status as ComplaintProps['status'],
      consumer: {
        fullName: this.codec.open(row.fullName),
        documentType: row.documentType as ComplaintProps['consumer']['documentType'],
        documentNumber: this.codec.open(row.documentNumber),
        address: this.codec.open(row.address),
        phone: this.codec.open(row.phone),
        email: this.codec.open(row.email),
        isMinor: row.isMinor,
        guardianName: this.codec.openNullable(row.guardianName),
      },
      emailHash: row.emailHash,
      item: { type: row.itemType as ComplaintProps['item']['type'], description: row.itemDescription, amount: row.itemAmount },
      detail: row.detail,
      request: row.request,
      ipHash: row.ipHash,
      receivedAt: row.receivedAt,
      responseDueBy: row.responseDueBy,
      response: row.response,
      respondedAt: row.respondedAt,
      respondedBy: row.respondedBy,
    };
  }
}

const PRIVACY_SELECT = {
  id: true,
  code: true,
  brand: true,
  type: true,
  status: true,
  fullName: true,
  email: true,
  emailHash: true,
  phone: true,
  phoneHash: true,
  reference: true,
  detail: true,
  ipHash: true,
  receivedAt: true,
  responseDueBy: true,
  resolution: true,
  resolvedAt: true,
  resolvedBy: true,
} satisfies Prisma.PrivacyRequestSelect;

type PrivacyRow = Prisma.PrivacyRequestGetPayload<{ select: typeof PRIVACY_SELECT }>;

@Injectable()
export class PrismaPrivacyRequestRepository implements PrivacyRequestRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PII_CODEC) private readonly codec: PiiCodec,
  ) {}

  async createWithSequence(
    input: Omit<PrivacyRequestProps, 'code'>,
    sequence: { kind: ComplianceSequenceKind; year: number; code: CodeFactory },
  ): Promise<PrivacyRequestProps> {
    return this.prisma.$transaction(async (tx) => {
      const code = sequence.code(await nextComplianceSequence(tx, input.brand, sequence.kind, sequence.year));
      await tx.privacyRequest.create({
        data: {
          id: input.id,
          code,
          brand: input.brand,
          type: input.type,
          status: input.status,
          fullName: this.codec.seal(input.fullName),
          email: this.codec.seal(input.email),
          emailHash: input.emailHash,
          phone: this.codec.sealNullable(input.phone),
          phoneHash: input.phoneHash,
          reference: input.reference,
          detail: input.detail,
          ipHash: input.ipHash,
          receivedAt: input.receivedAt,
          responseDueBy: input.responseDueBy,
        },
        select: { id: true },
      });
      return { ...input, code };
    });
  }

  async findById(id: string): Promise<PrivacyRequestProps | null> {
    const row = await this.prisma.privacyRequest.findUnique({ where: { id }, select: PRIVACY_SELECT });
    return row ? this.toProps(row) : null;
  }

  async list(
    filter: { brand?: string; status?: PrivacyRequestProps['status'] },
    page: ListPage,
  ): Promise<{ items: PrivacyRequestProps[]; total: number }> {
    const where: Prisma.PrivacyRequestWhereInput = {
      ...(filter.brand ? { brand: filter.brand } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.privacyRequest.count({ where }),
      this.prisma.privacyRequest.findMany({
        where,
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: page.offset,
        take: page.limit,
        select: PRIVACY_SELECT,
      }),
    ]);
    return { items: rows.map((row) => this.toProps(row)), total };
  }

  async saveResolution(
    id: string,
    input: { status: PrivacyRequestProps['status']; resolution: string; resolvedAt: Date | null; resolvedBy: string | null },
  ): Promise<void> {
    await this.prisma.privacyRequest.update({
      where: { id },
      data: { status: input.status, resolution: input.resolution, resolvedAt: input.resolvedAt, resolvedBy: input.resolvedBy },
      select: { id: true },
    });
  }

  private toProps(row: PrivacyRow): PrivacyRequestProps {
    return {
      id: row.id,
      code: row.code,
      brand: row.brand,
      type: row.type as PrivacyRequestProps['type'],
      status: row.status as PrivacyRequestProps['status'],
      fullName: this.codec.open(row.fullName),
      email: this.codec.open(row.email),
      emailHash: row.emailHash,
      phone: this.codec.openNullable(row.phone),
      phoneHash: row.phoneHash,
      reference: row.reference,
      detail: row.detail,
      ipHash: row.ipHash,
      receivedAt: row.receivedAt,
      responseDueBy: row.responseDueBy,
      resolution: row.resolution,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
    };
  }
}
