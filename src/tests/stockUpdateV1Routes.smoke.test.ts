import test from 'node:test';
import assert from 'node:assert/strict';
import { createStockUpdateV1Router } from '../interfaces/http/routes/stockUpdateV1Routes';
import { SellerCenterUpdateStockError } from '../infrastructure/sellercenter/stockRepositorySellerCenter';

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

function getStockUpdateRouteHandler(executor: {
  execute: (input: { sellerSku: string; quantity: number }) => Promise<unknown>;
}) {
  const router = createStockUpdateV1Router(executor as any);
  const stack = (router as any).stack as Array<any>;
  const layer = stack.find((entry) => entry.route?.path === '/' && entry.route?.methods?.put);

  if (!layer) {
    throw new Error('Stock update route not found in router stack');
  }

  return layer.route.stack[0].handle as (req: any, res: any) => Promise<unknown>;
}

test('smoke: PUT /v1/stock returns accepted payload', async () => {
  const handler = getStockUpdateRouteHandler({
    async execute(input) {
      return {
        success: true,
        status: 'accepted',
        action: 'UpdateStock',
        sellerSku: input.sellerSku,
        quantity: input.quantity,
        facilityId: 'GSC-SCBFD321E8A8D71',
        feedId: 'feed-123'
      };
    }
  });

  const req = {
    body: { sellerSku: '3516192124', quantity: 3 },
    method: 'PUT',
    originalUrl: '/v1/stock',
    headers: {}
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).status, 'accepted');
  assert.equal((res.body as any).feedId, 'feed-123');
});

test('smoke: PUT /v1/stock maps FSC 1001 to 404', async () => {
  const handler = getStockUpdateRouteHandler({
    async execute() {
      throw new SellerCenterUpdateStockError(
        'Invalid Seller Sku List: 3516192124',
        'UpdateStock',
        'Sender',
        '1001',
        'Invalid Seller Sku List: 3516192124'
      );
    }
  });

  const req = {
    body: { sellerSku: '3516192124', quantity: 3 },
    method: 'PUT',
    originalUrl: '/v1/stock',
    headers: {}
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    error: 'SKU no encontrado en Falabella Seller Center',
    details: {
      code: '1001',
      message: 'Invalid Seller Sku List: 3516192124'
    }
  });
});
