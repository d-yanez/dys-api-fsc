import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, MongoServerError } from 'mongodb';
import {
  createMongoInvoicePDFIdempotencyPersistence,
  MongoInvoicePDFIdempotencyPersistence,
} from '../infrastructure/mongodb/invoicePDFIdempotencyPersistence';

const result = {
  ok: true as const,
  action: 'SetInvoicePDF' as const,
  requestId: 'request-1',
  alreadyExists: false,
  message: 'ok',
};

class ScriptedCollection {
  updateResults: Array<{ matchedCount: number }> = [];
  findResults: any[] = [];
  insertError?: Error;
  updates: Array<{ filter: any; update: any }> = [];
  inserts: any[] = [];

  async updateOne(filter: any, update: any) {
    this.updates.push({ filter, update });
    return this.updateResults.shift() ?? { matchedCount: 0 };
  }

  async insertOne(document: any) {
    this.inserts.push(document);
    if (this.insertError) throw this.insertError;
    return { acknowledged: true };
  }

  async findOne() {
    return this.findResults.shift() ?? null;
  }

}

function persistence(collection: ScriptedCollection) {
  return new MongoInvoicePDFIdempotencyPersistence(collection as unknown as Collection<any>);
}

function acquireParams() {
  return {
    keyHash: 'hashed-key',
    fingerprint: 'fingerprint',
    ownerId: 'owner-1',
    now: 1_000,
    leaseExpiresAt: 2_000,
    expiresAt: 10_000,
  };
}

test('Mongo idempotency acquisition atomically takes an expired record without storing the raw key', async () => {
  const collection = new ScriptedCollection();
  collection.updateResults.push({ matchedCount: 1 });

  assert.deepEqual(await persistence(collection).acquire(acquireParams()), { state: 'acquired' });
  assert.equal(collection.inserts.length, 0);
  assert.equal(collection.updates[0].filter._id, 'hashed-key');
  assert.deepEqual(collection.updates[0].update.$unset, { result: '' });
  assert.equal(JSON.stringify(collection.updates).includes('invoiceDocument'), false);
});

test('Mongo idempotency acquisition inserts a new processing lease', async () => {
  const collection = new ScriptedCollection();

  assert.deepEqual(await persistence(collection).acquire(acquireParams()), { state: 'acquired' });
  assert.equal(collection.inserts[0]._id, 'hashed-key');
  assert.equal(collection.inserts[0].status, 'processing');
  assert.equal(collection.inserts[0].leaseExpiresAt.getTime(), 2_000);
});

test('Mongo idempotency acquisition classifies duplicate-key conflict and durable replay', async () => {
  const conflictCollection = new ScriptedCollection();
  conflictCollection.insertError = new MongoServerError({ code: 11000 });
  conflictCollection.findResults.push({
    ...acquireParams(),
    _id: 'hashed-key',
    fingerprint: 'different-fingerprint',
    status: 'succeeded',
    expiresAt: new Date(10_000),
    leaseExpiresAt: new Date(2_000),
    result,
  });
  assert.deepEqual(await persistence(conflictCollection).acquire(acquireParams()), { state: 'conflict' });

  const replayCollection = new ScriptedCollection();
  replayCollection.insertError = new MongoServerError({ code: 11000 });
  replayCollection.findResults.push({
    ...acquireParams(),
    _id: 'hashed-key',
    status: 'succeeded',
    expiresAt: new Date(10_000),
    leaseExpiresAt: new Date(2_000),
    result,
  });
  assert.deepEqual(await persistence(replayCollection).acquire(acquireParams()), { state: 'replay', result });
});

test('Mongo idempotency completion and release use owner-and-fingerprint CAS filters', async () => {
  const collection = new ScriptedCollection();
  collection.updateResults.push({ matchedCount: 1 });
  const store = persistence(collection);

  await store.complete({
    keyHash: 'hashed-key',
    fingerprint: 'fingerprint',
    ownerId: 'owner-1',
    result,
    now: 3_000,
    expiresAt: 10_000,
  });
  await store.release({ keyHash: 'hashed-key', fingerprint: 'fingerprint', ownerId: 'owner-1' });

  assert.deepEqual(collection.updates[0].filter, {
    _id: 'hashed-key',
    fingerprint: 'fingerprint',
    status: 'processing',
    ownerId: 'owner-1',
  });
  assert.deepEqual(collection.updates[1].filter, collection.updates[0].filter);
  assert.equal(collection.updates[1].update.$set.leaseExpiresAt.getTime(), 0);
  assert.equal(collection.updates[1].update.$set.expiresAt.getTime(), 0);
});

test('Mongo idempotency completion rejects a lost lease', async () => {
  const collection = new ScriptedCollection();
  await assert.rejects(
    () => persistence(collection).complete({
      keyHash: 'hashed-key',
      fingerprint: 'fingerprint',
      ownerId: 'owner-1',
      result,
      now: 3_000,
      expiresAt: 10_000,
    }),
    /lease ownership was lost/
  );
});

test('Mongo idempotency factory requires a URI and defaults are supplied by environment config', () => {
  assert.throws(
    () => createMongoInvoicePDFIdempotencyPersistence({ uri: ' ', dbName: 'falabellaDB' }),
    /MONGODB_URI/
  );
  assert.throws(
    () => createMongoInvoicePDFIdempotencyPersistence({ uri: 'mongodb:\/\/localhost', dbName: ' ' }),
    /MONGODB_DB_NAME/
  );
});
