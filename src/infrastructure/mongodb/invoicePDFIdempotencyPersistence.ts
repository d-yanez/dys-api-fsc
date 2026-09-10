import { Collection, MongoClient, MongoServerError } from 'mongodb';
import {
  AcquireInvoicePDFIdempotencyResult,
  InvoicePDFIdempotencyPersistence,
} from '../../application/services/invoicePDFIdempotency';
import { InvoicePDFUploadResult } from '../../domain/invoice/invoicePdfRepository';

export const INVOICE_PDF_IDEMPOTENCY_COLLECTION = 'invoice_pdf_idempotency';

interface MongoInvoicePDFIdempotencyRecord {
  _id: string;
  fingerprint: string;
  status: 'processing' | 'succeeded';
  ownerId: string;
  leaseExpiresAt: Date;
  expiresAt: Date;
  result?: InvoicePDFUploadResult;
  createdAt: Date;
  updatedAt: Date;
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof MongoServerError && error.code === 11000;
}

export class MongoInvoicePDFIdempotencyPersistence implements InvoicePDFIdempotencyPersistence {
  constructor(private readonly collection: Collection<MongoInvoicePDFIdempotencyRecord>) {}

  async acquire(params: {
    keyHash: string;
    fingerprint: string;
    ownerId: string;
    now: number;
    leaseExpiresAt: number;
    expiresAt: number;
  }): Promise<AcquireInvoicePDFIdempotencyResult> {
    const now = new Date(params.now);
    const processing = {
      fingerprint: params.fingerprint,
      status: 'processing' as const,
      ownerId: params.ownerId,
      leaseExpiresAt: new Date(params.leaseExpiresAt),
      expiresAt: new Date(params.expiresAt),
      updatedAt: now,
    };

    const takeover = await this.collection.updateOne(
      {
        _id: params.keyHash,
        $or: [
          { expiresAt: { $lte: now } },
          {
            fingerprint: params.fingerprint,
            status: 'processing',
            leaseExpiresAt: { $lte: now },
          },
        ],
      },
      {
        $set: processing,
        $unset: { result: '' },
      }
    );
    if (takeover.matchedCount === 1) return { state: 'acquired' };

    try {
      await this.collection.insertOne({
        _id: params.keyHash,
        ...processing,
        createdAt: now,
      });
      return { state: 'acquired' };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }

    const existing = await this.collection.findOne({ _id: params.keyHash });
    if (!existing) {
      // A TTL deletion can race the duplicate-key read. The next store poll can safely retry.
      return { state: 'processing', leaseExpiresAt: params.now };
    }
    if (existing.expiresAt.getTime() <= params.now) {
      return { state: 'processing', leaseExpiresAt: params.now };
    }
    if (existing.fingerprint !== params.fingerprint) return { state: 'conflict' };
    if (existing.status === 'succeeded' && existing.result) {
      return { state: 'replay', result: existing.result };
    }
    return { state: 'processing', leaseExpiresAt: existing.leaseExpiresAt.getTime() };
  }

  async complete(params: {
    keyHash: string;
    fingerprint: string;
    ownerId: string;
    result: InvoicePDFUploadResult;
    now: number;
    expiresAt: number;
  }): Promise<void> {
    const completed = await this.collection.updateOne(
      {
        _id: params.keyHash,
        fingerprint: params.fingerprint,
        status: 'processing',
        ownerId: params.ownerId,
      },
      {
        $set: {
          status: 'succeeded',
          result: params.result,
          leaseExpiresAt: new Date(params.now),
          expiresAt: new Date(params.expiresAt),
          updatedAt: new Date(params.now),
        },
      }
    );
    if (completed.matchedCount === 1) return;

    const existing = await this.collection.findOne({ _id: params.keyHash });
    if (
      existing?.status === 'succeeded' &&
      existing.ownerId === params.ownerId &&
      existing.fingerprint === params.fingerprint
    ) {
      return;
    }
    throw new Error('Idempotency lease ownership was lost before completion');
  }

  async release(params: { keyHash: string; fingerprint: string; ownerId: string }): Promise<void> {
    await this.collection.updateOne(
      {
        _id: params.keyHash,
        fingerprint: params.fingerprint,
        status: 'processing',
        ownerId: params.ownerId,
      },
      {
        $set: {
          leaseExpiresAt: new Date(0),
          expiresAt: new Date(0),
          updatedAt: new Date(),
        },
      }
    );
  }
}

export function createMongoInvoicePDFIdempotencyPersistence(params: {
  uri: string;
  dbName: string;
}): MongoInvoicePDFIdempotencyPersistence {
  const uri = params.uri.trim();
  const dbName = params.dbName.trim();
  if (!uri) throw new Error('Missing required environment variable MONGODB_URI');
  if (!dbName) throw new Error('Missing required environment variable MONGODB_DB_NAME');

  const client = new MongoClient(uri);
  return new MongoInvoicePDFIdempotencyPersistence(
    client.db(dbName).collection<MongoInvoicePDFIdempotencyRecord>(INVOICE_PDF_IDEMPOTENCY_COLLECTION)
  );
}
