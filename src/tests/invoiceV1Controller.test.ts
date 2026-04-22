import test from 'node:test';
import assert from 'node:assert/strict';
import { InvoiceV1Controller } from '../interfaces/http/controllers/invoiceV1Controller';
import { SellerCenterInvoicePDFError } from '../infrastructure/sellercenter/invoicePdfRepositorySellerCenter';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
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
