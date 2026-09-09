import { InvoicePDFRepository, InvoicePDFUploadInput, InvoicePDFUploadResult } from '../../domain/invoice/invoicePdfRepository';
import {
  fingerprintInvoicePDFUpload,
  hashIdempotencyKey,
  InMemoryInvoicePDFIdempotencyStore,
  InvoicePDFIdempotencyEvent,
  InvoicePDFIdempotencyStore,
} from '../services/invoicePDFIdempotency';

export interface UploadInvoicePDFOptions {
  idempotencyKey?: string;
}

export interface InvoicePDFIdempotencyLogEvent {
  event: InvoicePDFIdempotencyEvent;
  keyHash: string;
}

export class UploadInvoicePDFUseCase {
  constructor(
    private readonly repository: InvoicePDFRepository,
    private readonly idempotencyStore: InvoicePDFIdempotencyStore = new InMemoryInvoicePDFIdempotencyStore(),
    private readonly onIdempotencyEvent?: (event: InvoicePDFIdempotencyLogEvent) => void
  ) {}

  async execute(input: InvoicePDFUploadInput, options: UploadInvoicePDFOptions = {}): Promise<InvoicePDFUploadResult> {
    const orderItemIds = Array.isArray(input.orderItemIds)
      ? input.orderItemIds.map((v) => String(v).trim()).filter(Boolean)
      : [];

    if (orderItemIds.length === 0) {
      throw new Error('Invalid orderItemIds');
    }

    const invoiceNumber = String(input.invoiceNumber ?? '').trim();
    if (!/^\d+$/.test(invoiceNumber)) {
      throw new Error('Invalid invoiceNumber');
    }

    const invoiceDate = String(input.invoiceDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      throw new Error('Invalid invoiceDate');
    }

    const invoiceTypeRaw = String(input.invoiceType ?? '').trim().toUpperCase();
    if (invoiceTypeRaw !== 'BOLETA' && invoiceTypeRaw !== 'FACTURA') {
      throw new Error('Invalid invoiceType');
    }

    const operatorCode = String(input.operatorCode ?? '').trim();
    if (!operatorCode) {
      throw new Error('Invalid operatorCode');
    }

    const invoiceDocumentFormat = String(input.invoiceDocumentFormat ?? '').trim().toLowerCase();
    if (invoiceDocumentFormat !== 'pdf') {
      throw new Error('Invalid invoiceDocumentFormat');
    }

    const invoiceDocument = String(input.invoiceDocument ?? '').trim();
    if (!invoiceDocument) {
      throw new Error('Invalid invoiceDocument');
    }

    const normalizedInput: InvoicePDFUploadInput = {
      orderItemIds,
      invoiceNumber,
      invoiceDate,
      invoiceType: invoiceTypeRaw as 'BOLETA' | 'FACTURA',
      operatorCode,
      invoiceDocumentFormat: 'pdf',
      invoiceDocument,
    };

    const idempotencyKey = options.idempotencyKey?.trim();
    if (!idempotencyKey) {
      return this.repository.uploadPDF(normalizedInput);
    }
    if (idempotencyKey.length > 200 || !/^[\x21-\x7E]+$/.test(idempotencyKey)) {
      throw new Error('Invalid Idempotency-Key');
    }

    const keyHash = hashIdempotencyKey(idempotencyKey);
    try {
      const execution = await this.idempotencyStore.execute(
        idempotencyKey,
        fingerprintInvoicePDFUpload(normalizedInput),
        () => this.repository.uploadPDF(normalizedInput)
      );
      this.onIdempotencyEvent?.({ event: execution.replayed ? 'replayed' : 'started', keyHash });
      return execution.result;
    } catch (error) {
      if (error instanceof Error && error.name === 'IdempotencyKeyConflictError') {
        this.onIdempotencyEvent?.({ event: 'conflict', keyHash });
      }
      throw error;
    }
  }
}
