import { createHash } from 'node:crypto';
import { InvoicePDFUploadInput, InvoicePDFUploadResult } from '../../domain/invoice/invoicePdfRepository';

export type InvoicePDFIdempotencyEvent = 'started' | 'replayed' | 'conflict';

export interface InvoicePDFIdempotencyStore {
  execute(
    key: string,
    fingerprint: string,
    operation: () => Promise<InvoicePDFUploadResult>
  ): Promise<{ result: InvoicePDFUploadResult; replayed: boolean }>;
}

interface StoredOperation {
  fingerprint: string;
  expiresAt: number;
  promise: Promise<InvoicePDFUploadResult>;
}

export class IdempotencyKeyConflictError extends Error {
  constructor() {
    super('Idempotency-Key was already used with a different request');
    this.name = 'IdempotencyKeyConflictError';
  }
}

export class InMemoryInvoicePDFIdempotencyStore implements InvoicePDFIdempotencyStore {
  private readonly operations = new Map<string, StoredOperation>();

  constructor(
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly maxEntries = 10_000,
    private readonly now: () => number = Date.now
  ) {}

  async execute(
    key: string,
    fingerprint: string,
    operation: () => Promise<InvoicePDFUploadResult>
  ): Promise<{ result: InvoicePDFUploadResult; replayed: boolean }> {
    this.removeExpired();

    const existing = this.operations.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new IdempotencyKeyConflictError();
      }

      return { result: await existing.promise, replayed: true };
    }

    this.evictOldestIfFull();
    const promise = operation();
    this.operations.set(key, {
      fingerprint,
      expiresAt: this.now() + this.ttlMs,
      promise,
    });

    try {
      return { result: await promise, replayed: false };
    } catch (error) {
      if (this.operations.get(key)?.promise === promise) {
        this.operations.delete(key);
      }
      throw error;
    }
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [key, operation] of this.operations) {
      if (operation.expiresAt <= now) {
        this.operations.delete(key);
      }
    }
  }

  private evictOldestIfFull(): void {
    if (this.operations.size < this.maxEntries) {
      return;
    }

    const oldestKey = this.operations.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      this.operations.delete(oldestKey);
    }
  }
}

export function fingerprintInvoicePDFUpload(input: InvoicePDFUploadInput): string {
  const documentHash = createHash('sha256').update(input.invoiceDocument).digest('hex');
  return createHash('sha256')
    .update(
      JSON.stringify({
        orderItemIds: input.orderItemIds,
        invoiceNumber: input.invoiceNumber,
        invoiceDate: input.invoiceDate,
        invoiceType: input.invoiceType,
        operatorCode: input.operatorCode,
        invoiceDocumentFormat: input.invoiceDocumentFormat,
        documentHash,
      })
    )
    .digest('hex');
}

export function hashIdempotencyKey(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}
