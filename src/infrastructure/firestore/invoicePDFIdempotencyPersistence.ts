import { Firestore, Timestamp } from '@google-cloud/firestore';
import { AcquireInvoicePDFIdempotencyResult, InvoicePDFIdempotencyPersistence } from '../../application/services/invoicePDFIdempotency';
import { InvoicePDFUploadResult } from '../../domain/invoice/invoicePdfRepository';

const COLLECTION_NAME = 'invoice_pdf_idempotency_v1';

interface FirestoreRecord {
  fingerprint: string;
  status: 'processing' | 'succeeded';
  ownerId: string;
  leaseExpiresAt: Timestamp;
  expiresAt: Timestamp;
  result?: InvoicePDFUploadResult;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export class FirestoreInvoicePDFIdempotencyPersistence implements InvoicePDFIdempotencyPersistence {
  constructor(private readonly firestore = new Firestore(), private readonly collectionName = COLLECTION_NAME) {}

  async acquire(params: { keyHash: string; fingerprint: string; ownerId: string; now: number; leaseExpiresAt: number; expiresAt: number }): Promise<AcquireInvoicePDFIdempotencyResult> {
    const document = this.firestore.collection(this.collectionName).doc(params.keyHash);
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      const existing = snapshot.exists ? snapshot.data() as FirestoreRecord : undefined;
      if (existing && existing.expiresAt.toMillis() > params.now) {
        if (existing.fingerprint !== params.fingerprint) return { state: 'conflict' };
        if (existing.status === 'succeeded' && existing.result) return { state: 'replay', result: existing.result };
        if (existing.status === 'processing' && existing.leaseExpiresAt.toMillis() > params.now) {
          return { state: 'processing', leaseExpiresAt: existing.leaseExpiresAt.toMillis() };
        }
      }

      const now = Timestamp.fromMillis(params.now);
      transaction.set(document, {
        fingerprint: params.fingerprint,
        status: 'processing',
        ownerId: params.ownerId,
        leaseExpiresAt: Timestamp.fromMillis(params.leaseExpiresAt),
        expiresAt: Timestamp.fromMillis(params.expiresAt),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      } satisfies FirestoreRecord);
      return { state: 'acquired' };
    });
  }

  async complete(params: { keyHash: string; fingerprint: string; ownerId: string; result: InvoicePDFUploadResult; now: number; expiresAt: number }): Promise<void> {
    const document = this.firestore.collection(this.collectionName).doc(params.keyHash);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      const existing = snapshot.data() as FirestoreRecord | undefined;
      if (existing?.status === 'succeeded' && existing.ownerId === params.ownerId && existing.fingerprint === params.fingerprint) return;
      if (!existing || existing.status !== 'processing' || existing.ownerId !== params.ownerId || existing.fingerprint !== params.fingerprint) {
        throw new Error('Idempotency lease ownership was lost before completion');
      }
      transaction.update(document, {
        status: 'succeeded',
        result: params.result,
        leaseExpiresAt: Timestamp.fromMillis(params.now),
        expiresAt: Timestamp.fromMillis(params.expiresAt),
        updatedAt: Timestamp.fromMillis(params.now),
      });
    });
  }

  async release(params: { keyHash: string; fingerprint: string; ownerId: string }): Promise<void> {
    const document = this.firestore.collection(this.collectionName).doc(params.keyHash);
    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      const existing = snapshot.data() as FirestoreRecord | undefined;
      if (existing?.status === 'processing' && existing.ownerId === params.ownerId && existing.fingerprint === params.fingerprint) transaction.delete(document);
    });
  }
}
