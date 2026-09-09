import test from 'node:test';
import assert from 'node:assert/strict';
import { UploadInvoicePDFUseCase } from '../application/use-cases/uploadInvoicePDFUseCase';
import { InvoicePDFRepository } from '../domain/invoice/invoicePdfRepository';

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
  const uc = new UploadInvoicePDFUseCase(repo, undefined, ({ event }) => events.push(event));

  const first = await uc.execute(validInput, { idempotencyKey: 'dte-order-1' });
  const replay = await uc.execute({ ...validInput }, { idempotencyKey: 'dte-order-1' });

  assert.deepEqual(replay, first);
  assert.equal(repo.calls, 1);
  assert.deepEqual(events, ['started', 'replayed']);
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
  const uc = new UploadInvoicePDFUseCase(repository);

  const first = uc.execute(validInput, { idempotencyKey: 'dte-order-2' });
  const second = uc.execute({ ...validInput }, { idempotencyKey: 'dte-order-2' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);

  releaseUpload?.();
  assert.deepEqual(await second, await first);
});

test('UploadInvoicePDFUseCase rejects conflicting reuse of an idempotency key', async () => {
  const repo = new FakeRepo();
  const uc = new UploadInvoicePDFUseCase(repo);
  await uc.execute(validInput, { idempotencyKey: 'dte-order-3' });

  await assert.rejects(
    () => uc.execute({ ...validInput, invoiceNumber: '8482' }, { idempotencyKey: 'dte-order-3' }),
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
  const uc = new UploadInvoicePDFUseCase(repository);

  await assert.rejects(() => uc.execute(validInput, { idempotencyKey: 'dte-order-4' }), /temporary failure/);
  const result = await uc.execute(validInput, { idempotencyKey: 'dte-order-4' });

  assert.equal(result.ok, true);
  assert.equal(calls, 2);
});
