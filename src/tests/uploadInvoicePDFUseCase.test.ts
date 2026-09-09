import test from 'node:test';
import assert from 'node:assert/strict';
import { UploadInvoicePDFUseCase } from '../application/use-cases/uploadInvoicePDFUseCase';
import { InvoicePDFRepository } from '../domain/invoice/invoicePdfRepository';
import {
  DurableInvoicePDFIdempotencyStore,
  fingerprintInvoicePDFUpload,
  hashIdempotencyKey,
  IdempotencyOperationInProgressError,
  InvoicePDFIdempotencyPersistence,
} from '../application/services/invoicePDFIdempotency';

class FakeRepo implements InvoicePDFRepository {
  lastInput: any;
  calls = 0;
  async uploadPDF(input: any): Promise<any> {
    this.calls += 1;
    this.lastInput = input;
    return {
      ok: true,
      action: 'SetInvoicePDF',
      requestId: '123',
      alreadyExists: false,
      message: 'ok',
    };
  }
}

const validInput = {
  orderItemIds: ['164027299'],
  invoiceNumber: '8481',
  invoiceDate: '2026-04-22',
  invoiceType: 'BOLETA' as const,
  operatorCode: 'FACL',
  invoiceDocumentFormat: 'pdf' as const,
  invoiceDocument: 'JVBERi0xLjQ=',
};

class FakePersistence implements InvoicePDFIdempotencyPersistence {
  records = new Map<string, any>();

  async acquire(params: any): Promise<any> {
    const existing = this.records.get(params.keyHash);
    if (existing && existing.expiresAt > params.now) {
      if (existing.fingerprint !== params.fingerprint) return { state: 'conflict' };
      if (existing.status === 'succeeded') return { state: 'replay', result: existing.result };
      if (existing.leaseExpiresAt > params.now) return { state: 'processing', leaseExpiresAt: existing.leaseExpiresAt };
    }
    this.records.set(params.keyHash, { ...params, status: 'processing' });
    return { state: 'acquired' };
  }

  async complete(params: any): Promise<void> {
    const existing = this.records.get(params.keyHash);
    if (!existing || existing.ownerId !== params.ownerId) throw new Error('lost lease');
    this.records.set(params.keyHash, { ...existing, ...params, status: 'succeeded' });
  }

  async release(params: any): Promise<void> {
    const existing = this.records.get(params.keyHash);
    if (existing?.ownerId === params.ownerId) this.records.delete(params.keyHash);
  }
}

function createIdempotencyStore(persistence = new FakePersistence(), ownerId = 'owner-1') {
  return new DurableInvoicePDFIdempotencyStore(persistence, 86_400_000, 600_000, 1, 5_000, Date.now, () => ownerId);
}

test('UploadInvoicePDFUseCase normalizes and delegates', async () => {
  const repo = new FakeRepo();
  const uc = new UploadInvoicePDFUseCase(repo);
  const res = await uc.execute({
    ...validInput,
    orderItemIds: [' 164027299 '],
    invoiceType: 'boleta' as any,
  });
  assert.equal(res.ok, true);
  assert.equal(repo.lastInput.invoiceType, 'BOLETA');
  assert.deepEqual(repo.lastInput.orderItemIds, ['164027299']);
});

test('UploadInvoicePDFUseCase validates required fields', async () => {
  const uc = new UploadInvoicePDFUseCase(new FakeRepo());
  await assert.rejects(() => uc.execute({ ...validInput, orderItemIds: [] as any }), /Invalid orderItemIds/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceNumber: 'bad' as any }), /Invalid invoiceNumber/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceDate: '22-04-2026' as any }), /Invalid invoiceDate/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceType: 'NC' as any }), /Invalid invoiceType/);
  await assert.rejects(() => uc.execute({ ...validInput, operatorCode: '' as any }), /Invalid operatorCode/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceDocumentFormat: 'xml' as any }), /Invalid invoiceDocumentFormat/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceDocument: '' as any }), /Invalid invoiceDocument/);
});

test('UploadInvoicePDFUseCase replays an equivalent idempotent request without another upload', async () => {
  const repo = new FakeRepo();
  const events: string[] = [];
  const uc = new UploadInvoicePDFUseCase(repo, createIdempotencyStore(), ({ event }) => events.push(event));

  const first = await uc.execute(validInput, { idempotencyKey: 'dte-order-1' });
  const replay = await uc.execute({ ...validInput }, { idempotencyKey: 'dte-order-1' });

  assert.deepEqual(replay, first);
  assert.equal(repo.calls, 1);
  assert.deepEqual(events, ['started', 'replayed']);
});

test('UploadInvoicePDFUseCase replays persisted success after a service restart', async () => {
  const repo = new FakeRepo();
  const persistence = new FakePersistence();
  const beforeRestart = new UploadInvoicePDFUseCase(repo, createIdempotencyStore(persistence, 'instance-before-restart'));
  const afterRestart = new UploadInvoicePDFUseCase(repo, createIdempotencyStore(persistence, 'instance-after-restart'));

  const first = await beforeRestart.execute(validInput, { idempotencyKey: 'dte-order-restart' });
  const replay = await afterRestart.execute({ ...validInput }, { idempotencyKey: 'dte-order-restart' });

  assert.deepEqual(replay, first);
  assert.equal(repo.calls, 1);
  const persisted = [...persistence.records.values()][0];
  assert.equal(persisted.status, 'succeeded');
  assert.equal(JSON.stringify(persisted).includes(validInput.invoiceDocument), false);
});

test('UploadInvoicePDFUseCase coalesces concurrent requests with the same idempotency key', async () => {
  let releaseUpload: (() => void) | undefined;
  let calls = 0;
  const repository: InvoicePDFRepository = {
    async uploadPDF() {
      calls += 1;
      await new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
      return {
        ok: true,
        action: 'SetInvoicePDF',
        requestId: 'concurrent-1',
        alreadyExists: false,
        message: 'ok',
      };
    },
  };
  const persistence = new FakePersistence();
  const firstInstance = new UploadInvoicePDFUseCase(repository, createIdempotencyStore(persistence, 'instance-1'));
  const secondInstance = new UploadInvoicePDFUseCase(repository, createIdempotencyStore(persistence, 'instance-2'));

  const first = firstInstance.execute(validInput, { idempotencyKey: 'dte-order-2' });
  const second = secondInstance.execute({ ...validInput }, { idempotencyKey: 'dte-order-2' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);

  releaseUpload?.();
  assert.deepEqual(await second, await first);
});

test('UploadInvoicePDFUseCase rejects conflicting reuse of an idempotency key', async () => {
  const repo = new FakeRepo();
  const persistence = new FakePersistence();
  const beforeRestart = new UploadInvoicePDFUseCase(repo, createIdempotencyStore(persistence, 'instance-1'));
  const afterRestart = new UploadInvoicePDFUseCase(repo, createIdempotencyStore(persistence, 'instance-2'));
  await beforeRestart.execute(validInput, { idempotencyKey: 'dte-order-3' });

  await assert.rejects(
    () => afterRestart.execute({ ...validInput, invoiceNumber: '8482' }, { idempotencyKey: 'dte-order-3' }),
    /Idempotency-Key was already used with a different request/
  );
  assert.equal(repo.calls, 1);
});

test('UploadInvoicePDFUseCase preserves non-idempotent behavior when the header is absent', async () => {
  const repo = new FakeRepo();
  const uc = new UploadInvoicePDFUseCase(repo);

  await uc.execute(validInput);
  await uc.execute(validInput);

  assert.equal(repo.calls, 2);
});

test('UploadInvoicePDFUseCase does not retain failed idempotent operations', async () => {
  let calls = 0;
  const repository: InvoicePDFRepository = {
    async uploadPDF() {
      calls += 1;
      if (calls === 1) {
        throw new Error('temporary failure');
      }
      return {
        ok: true,
        action: 'SetInvoicePDF',
        requestId: 'retry-1',
        alreadyExists: false,
        message: 'ok',
      };
    },
  };
  const uc = new UploadInvoicePDFUseCase(repository, createIdempotencyStore());

  await assert.rejects(() => uc.execute(validInput, { idempotencyKey: 'dte-order-4' }), /temporary failure/);
  const result = await uc.execute(validInput, { idempotencyKey: 'dte-order-4' });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});

test('UploadInvoicePDFUseCase bounds waiting for a processing request', async () => {
  const persistence = new FakePersistence();
  const key = 'bounded-waiter';
  const fingerprint = fingerprintInvoicePDFUpload(validInput);
  await persistence.acquire({ keyHash: hashIdempotencyKey(key), fingerprint, ownerId: 'other', now: 0, leaseExpiresAt: 600_000, expiresAt: 86_400_000 });
  let now = 0;
  const store = new DurableInvoicePDFIdempotencyStore(
    persistence,
    86_400_000,
    600_000,
    10,
    30,
    () => now,
    () => 'waiter',
    async (ms) => { now += ms; }
  );
  let calls = 0;

  await assert.rejects(
    () => store.execute(key, fingerprint, async () => { calls += 1; return new FakeRepo().uploadPDF(validInput); }),
    IdempotencyOperationInProgressError
  );
  assert.equal(calls, 0);
});

test('UploadInvoicePDFUseCase cancels a waiter without executing the upload', async () => {
  const persistence = new FakePersistence();
  const key = 'cancelled-waiter';
  const fingerprint = fingerprintInvoicePDFUpload(validInput);
  await persistence.acquire({ keyHash: hashIdempotencyKey(key), fingerprint, ownerId: 'other', now: Date.now(), leaseExpiresAt: Date.now() + 600_000, expiresAt: Date.now() + 86_400_000 });
  const abort = new AbortController();
  let calls = 0;
  setImmediate(() => abort.abort());

  await assert.rejects(
    () => createIdempotencyStore(persistence, 'waiter').execute(key, fingerprint, async () => { calls += 1; return new FakeRepo().uploadPDF(validInput); }, abort.signal),
    (error: unknown) => error instanceof Error && error.name === 'AbortError'
  );
  assert.equal(calls, 0);
});

test('UploadInvoicePDFUseCase cannot finalize after lease ownership is lost', async () => {
  const persistence = new FakePersistence();
  const key = 'lost-owner';
  const keyHash = hashIdempotencyKey(key);
  const fingerprint = fingerprintInvoicePDFUpload(validInput);
  const store = createIdempotencyStore(persistence, 'original-owner');

  await assert.rejects(
    () => store.execute(key, fingerprint, async () => {
      const record = persistence.records.get(keyHash);
      persistence.records.set(keyHash, { ...record, ownerId: 'replacement-owner' });
      return new FakeRepo().uploadPDF(validInput);
    }),
    /lost lease/
  );
  assert.equal(persistence.records.get(keyHash).ownerId, 'replacement-owner');
  assert.equal(persistence.records.get(keyHash).status, 'processing');
});

test('UploadInvoicePDFUseCase releases ownership when cancellation wins after the upload returns', async () => {
  const persistence = new FakePersistence();
  const abort = new AbortController();
  const store = createIdempotencyStore(persistence, 'cancelled-owner');

  await assert.rejects(
    () => store.execute('cancelled-owner', fingerprintInvoicePDFUpload(validInput), async () => {
      abort.abort();
      return new FakeRepo().uploadPDF(validInput);
    }, abort.signal),
    (error: unknown) => error instanceof Error && error.name === 'AbortError'
  );

  assert.equal(persistence.records.size, 0);
});
