import { createHash, randomUUID } from 'node:crypto';
import { InvoicePDFUploadInput, InvoicePDFUploadResult } from '../../domain/invoice/invoicePdfRepository';

export type InvoicePDFIdempotencyEvent = 'started' | 'replayed' | 'conflict';

export interface InvoicePDFIdempotencyStore {
  execute(key: string, fingerprint: string, operation: () => Promise<InvoicePDFUploadResult>, signal?: AbortSignal): Promise<{ result: InvoicePDFUploadResult; replayed: boolean }>;
}

export type AcquireInvoicePDFIdempotencyResult =
  | { state: 'acquired' }
  | { state: 'processing'; leaseExpiresAt: number }
  | { state: 'replay'; result: InvoicePDFUploadResult }
  | { state: 'conflict' };

export interface InvoicePDFIdempotencyPersistence {
  acquire(params: { keyHash: string; fingerprint: string; ownerId: string; now: number; leaseExpiresAt: number; expiresAt: number }): Promise<AcquireInvoicePDFIdempotencyResult>;
  complete(params: { keyHash: string; fingerprint: string; ownerId: string; result: InvoicePDFUploadResult; now: number; expiresAt: number }): Promise<void>;
  release(params: { keyHash: string; fingerprint: string; ownerId: string }): Promise<void>;
}

export class IdempotencyKeyConflictError extends Error {
  constructor() {
    super('Idempotency-Key was already used with a different request');
    this.name = 'IdempotencyKeyConflictError';
  }
}

export class IdempotencyOperationInProgressError extends Error {
  constructor() {
    super('An equivalent idempotent request is still processing');
    this.name = 'IdempotencyOperationInProgressError';
  }
}

export const IDEMPOTENCY_PROCESSING_WAIT_TIMEOUT_MS = 1_000;

export function createAbortError(): Error {
  const error = new Error('Request was aborted');
  error.name = 'AbortError';
  return error;
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      reject(createAbortError());
    }
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

export class DurableInvoicePDFIdempotencyStore implements InvoicePDFIdempotencyStore {
  constructor(
    private readonly persistence: InvoicePDFIdempotencyPersistence,
    private readonly successTtlMs = 24 * 60 * 60 * 1000,
    private readonly leaseMs = 10 * 60 * 1000,
    private readonly pollIntervalMs = 100,
    private readonly waitTimeoutMs = IDEMPOTENCY_PROCESSING_WAIT_TIMEOUT_MS,
    private readonly now: () => number = Date.now,
    private readonly createOwnerId: () => string = randomUUID,
    private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void> = abortableSleep
  ) {}

  async execute(key: string, fingerprint: string, operation: () => Promise<InvoicePDFUploadResult>, signal?: AbortSignal): Promise<{ result: InvoicePDFUploadResult; replayed: boolean }> {
    const keyHash = hashIdempotencyKey(key);
    const ownerId = this.createOwnerId();
    const waitDeadline = this.now() + this.waitTimeoutMs;

    for (;;) {
      if (signal?.aborted) throw createAbortError();
      const now = this.now();
      const acquired = await this.persistence.acquire({
        keyHash,
        fingerprint,
        ownerId,
        now,
        leaseExpiresAt: now + this.leaseMs,
        expiresAt: now + this.successTtlMs,
      });
      if (acquired.state === 'conflict') throw new IdempotencyKeyConflictError();
      if (acquired.state === 'replay') return { result: acquired.result, replayed: true };
      if (acquired.state === 'processing') {
        if (now >= waitDeadline) throw new IdempotencyOperationInProgressError();
        await this.sleep(Math.max(1, Math.min(this.pollIntervalMs, acquired.leaseExpiresAt - now, waitDeadline - now)), signal);
        continue;
      }

      let result: InvoicePDFUploadResult;
      try {
        result = await operation();
        if (signal?.aborted) throw createAbortError();
      } catch (error) {
        await this.persistence.release({ keyHash, fingerprint, ownerId }).catch(() => undefined);
        throw error;
      }
      const completedAt = this.now();
      await this.persistence.complete({ keyHash, fingerprint, ownerId, result, now: completedAt, expiresAt: completedAt + this.successTtlMs });
      return { result, replayed: false };
    }
  }
}

export function fingerprintInvoicePDFUpload(input: InvoicePDFUploadInput): string {
  const documentHash = createHash('sha256').update(input.invoiceDocument).digest('hex');
  return createHash('sha256').update(JSON.stringify({
    orderItemIds: input.orderItemIds,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    invoiceType: input.invoiceType,
    operatorCode: input.operatorCode,
    invoiceDocumentFormat: input.invoiceDocumentFormat,
    documentHash,
  })).digest('hex');
}

export function hashIdempotencyKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
