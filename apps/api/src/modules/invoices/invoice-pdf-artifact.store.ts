import { BadRequestException, ConflictException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { isPrismaTransactionConflict, withSerializableRetry } from '../../common/serializable-retry';
import { AuditLogService } from '../audit/audit-log.service';
import { INVOICE_PDF_LIMITS } from './invoice-pdf-template';

type ArtifactInput = {
  documentId: string;
  documentPayloadHash: string;
  renderInputHash: string;
  rendererRevision: string;
  templateRevision: string;
  fontSha256: string;
  bytes: Buffer;
};
// Never select/return private bytes when reconciling a completed write.
const metadata = { id: true, documentId: true, pdfSha256: true, byteCount: true, createdAt: true } as const;
const unavailable = () => new ServiceUnavailableException({ code: 'INVOICE_PDF_STORAGE_UNAVAILABLE', message: 'Private invoice PDF storage is unavailable; reconcile before retrying.' });

/** Internal persistence only. Not an authorization boundary or an HTTP provider.
 * Future jobs must bind trusted immutable inputs and current authorization first.
 */
@Injectable()
export class InvoicePdfArtifactStore {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async persist(input: ArtifactInput, requestId: string) {
    const hashPattern = /^[a-f0-9]{64}$/u;
    const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
    if (!input || typeof input.documentId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(input.documentId)
      || ![input.documentPayloadHash, input.renderInputHash, input.fontSha256].every(value => typeof value === 'string' && hashPattern.test(value))
      || ![input.rendererRevision, input.templateRevision].every(value => typeof value === 'string' && revisionPattern.test(value))
      || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(requestId)
      || !Buffer.isBuffer(input.bytes) || input.bytes.length < 5 || input.bytes.length > INVOICE_PDF_LIMITS.pdfBytes
      || !input.bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new BadRequestException({ code: 'INVOICE_PDF_ARTIFACT_INVALID', message: 'A bounded PDF and immutable rendering identity are required.' });
    }
    // Own the buffer before awaiting: callers cannot mutate evidence in flight.
    const bytes = Buffer.from(input.bytes);
    const identity = { documentId: input.documentId, renderInputHash: input.renderInputHash, rendererRevision: input.rendererRevision,
      templateRevision: input.templateRevision, fontSha256: input.fontSha256 };
    const documentPayloadHash = input.documentPayloadHash;
    const pdfSha256 = createHash('sha256').update(bytes).digest('hex');
    try {
      return await withSerializableRetry({ isContention: isPrismaTransactionConflict,
        conflictMessage: 'PDF storage changed concurrently; reconcile the same immutable input.',
        operation: () => this.prisma.$transaction(async tx => {
          // Global lock also serializes different input keys at the last byte/slot.
          await tx.$queryRaw`SELECT "id" FROM "InvoicePdfStorageCapacity" WHERE "id" = 'invoice-pdf' FOR UPDATE`;
          const document = await tx.invoiceDocument.findUnique({ where: { id: identity.documentId }, select: { payloadHash: true } });
          if (!document || document.payloadHash !== documentPayloadHash) throw new ConflictException({ code: 'INVOICE_PDF_SOURCE_MISMATCH', message: 'The immutable issued document does not match.' });
          const prior = await tx.invoicePdfArtifact.findUnique({
            where: { documentId_renderInputHash_rendererRevision_templateRevision_fontSha256: identity }, select: metadata });
          if (prior) return { artifact: prior, replayed: true };
          const capacity = await tx.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } });
          if (!capacity?.isEnabled) throw unavailable();
          if (capacity.artifactCount >= capacity.maxArtifacts || BigInt(bytes.length) > capacity.budgetBytes - capacity.storedBytes) {
            throw new ConflictException({ code: 'INVOICE_PDF_CAPACITY_EXCEEDED', message: 'Approved private PDF storage capacity is exhausted.' });
          }
          const artifact = await tx.invoicePdfArtifact.create({ data: { ...identity, documentPayloadHash, bytes, byteCount: bytes.length, pdfSha256 }, select: metadata });
          await this.audit.record({ action: 'invoice.pdf.stored', entityType: 'InvoicePdfArtifact', entityId: artifact.id, requestId,
            metadata: { documentId: identity.documentId, byteCount: artifact.byteCount } }, tx);
          return { artifact, replayed: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Driver exceptions may embed SQL, bytes or private invoice text. Do not log.
      throw unavailable();
    }
  }
}
