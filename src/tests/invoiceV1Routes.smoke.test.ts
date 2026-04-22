import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoiceV1Router } from '../interfaces/http/routes/invoiceV1Routes';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };

  return res;
}

function getInvoiceRouteHandler(executor: { execute: (input: any) => Promise<unknown> }) {
  const router = createInvoiceV1Router(executor as any);
  const stack = (router as any).stack as Array<any>;
  const layer = stack.find((entry) => entry.route?.path === '/pdf' && entry.route?.methods?.post);

  if (!layer) {
    throw new Error('invoice pdf route not found in router stack');
  }

  return layer.route.stack[0].handle as (req: any, res: any) => Promise<unknown>;
}

test('smoke: POST /v1/invoices/pdf returns success payload', async () => {
  const handler = getInvoiceRouteHandler({
    async execute() {
      return {
        ok: true,
        action: 'SetInvoicePDF',
        requestId: '123',
        alreadyExists: false,
        message: 'Invoice PDF uploaded',
      };
    },
  });

  const req = {
    body: {
      orderItemIds: ['164027299'],
      invoiceNumber: '8481',
      invoiceDate: '2026-04-21',
      invoiceType: 'BOLETA',
      operatorCode: 'FACL',
      invoiceDocumentFormat: 'pdf',
      invoiceDocument: 'JVBERi0xLjQ=',
    },
    method: 'POST',
    originalUrl: '/v1/invoices/pdf',
    headers: {},
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).ok, true);
});
