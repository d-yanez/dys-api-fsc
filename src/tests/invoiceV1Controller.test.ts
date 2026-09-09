import test from 'node:test';
import assert from 'node:assert/strict';
import { InvoiceV1Controller } from '../interfaces/http/controllers/invoiceV1Controller';
import { SellerCenterInvoicePDFError, SellerCenterInvoicePDFTransientError } from '../infrastructure/sellercenter/invoicePdfRepositorySellerCenter';
import { IdempotencyCompletionTimeoutError, IdempotencyOperationInProgressError } from '../application/services/invoicePDFIdempotency';

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  setHeader: (name: string, value: string) => MockResponse;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
  };
}

test('InvoiceV1Controller maps validation error to 400', async () => {
  const controller = new InvoiceV1Controller({
    async execute() {
      throw new Error('Invalid invoiceNumber');
    },
  } as any);
  const req = { body: {}, method: 'POST', originalUrl: '/v1/invoices/pdf', headers: {} } as any;
  const res = createMockResponse();

  await controller.uploadInvoicePDF(req, res as any);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as any).code, 'VALIDATION_ERROR');
});

test('InvoiceV1Controller maps SellerCenterInvoicePDFError to 400', async () => {
  const controller = new InvoiceV1Controller({
    async execute() {
      throw new SellerCenterInvoicePDFError('bad payload', 'E999', 'req-1', 200);
    },
  } as any);
  const req = { body: {}, method: 'POST', originalUrl: '/v1/invoices/pdf', headers: {} } as any;
  const res = createMockResponse();

  await controller.uploadInvoicePDF(req, res as any);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as any).code, 'E999');
});

test('InvoiceV1Controller maps upstream HTTP message to 502', async () => {
  const controller = new InvoiceV1Controller({
    async execute() {
      throw new Error('SellerCenter SetInvoicePDF HTTP 500');
    },
  } as any);
  const req = { body: {}, method: 'POST', originalUrl: '/v1/invoices/pdf', headers: {} } as any;
  const res = createMockResponse();

  await controller.uploadInvoicePDF(req, res as any);
  assert.equal(res.statusCode, 502);
});

test('InvoiceV1Controller passes Idempotency-Key to the use case', async () => {
  let receivedOptions: unknown;
  const controller = new InvoiceV1Controller({
    async execute(_input, options) {
      receivedOptions = options;
      return { ok: true };
    },
  });
  const req = {
    body: {},
    method: 'POST',
    originalUrl: '/v1/invoices/pdf',
    headers: { 'idempotency-key': 'dte-order-5' },
  } as any;
  const res = createMockResponse();

  await controller.uploadInvoicePDF(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal((receivedOptions as any).idempotencyKey, 'dte-order-5');
  assert.ok((receivedOptions as any).signal instanceof AbortSignal);
});

test('InvoiceV1Controller maps conflicting Idempotency-Key reuse to 409', async () => {
  const { IdempotencyKeyConflictError } = await import('../application/services/invoicePDFIdempotency');
  const controller = new InvoiceV1Controller({
    async execute() {
      throw new IdempotencyKeyConflictError();
    },
  });
  const req = { body: {}, method: 'POST', originalUrl: '/v1/invoices/pdf', headers: {} } as any;
  const res = createMockResponse();

  await controller.uploadInvoicePDF(req, res as any);

  assert.equal(res.statusCode, 409);
  assert.equal((res.body as any).code, 'IDEMPOTENCY_KEY_CONFLICT');
});

test('InvoiceV1Controller returns retryable 503 while an idempotent upload is processing', async () => {
  const controller = new InvoiceV1Controller({
    async execute() {
      throw new IdempotencyOperationInProgressError();
    },
  });
  const req = { body: {}, method: 'POST', originalUrl: '/v1/invoices/pdf', headers: {} } as any;
  const res = createMockResponse();

  await controller.uploadInvoicePDF(req, res as any);

  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Retry-After'], '1');
  assert.equal((res.body as any).code, 'IDEMPOTENCY_OPERATION_IN_PROGRESS');
});

test('InvoiceV1Controller maps a bounded upstream timeout to retryable 504', async () => {
  const controller = new InvoiceV1Controller({
    async execute() {
      throw new SellerCenterInvoicePDFTransientError('UPSTREAM_TIMEOUT');
    },
  });
  const req = { body: {}, method: 'POST', originalUrl: '/v1/invoices/pdf', headers: {} } as any;
  const res = createMockResponse();

  await controller.uploadInvoicePDF(req, res as any);

  assert.equal(res.statusCode, 504);
  assert.equal((res.body as any).code, 'UPSTREAM_TIMEOUT');
});

test('InvoiceV1Controller returns retryable 503 when detached completion times out', async () => {
  const controller = new InvoiceV1Controller({
    async execute() {
      throw new IdempotencyCompletionTimeoutError();
    },
  });
  const req = { body: {}, method: 'POST', originalUrl: '/v1/invoices/pdf', headers: {} } as any;
  const res = createMockResponse();

  await controller.uploadInvoicePDF(req, res as any);

  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Retry-After'], '1');
  assert.equal((res.body as any).code, 'IDEMPOTENCY_COMPLETION_TIMEOUT');
});
