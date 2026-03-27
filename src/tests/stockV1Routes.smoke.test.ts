import test from 'node:test';
import assert from 'node:assert/strict';
import { createStockV1Router } from '../interfaces/http/routes/stockV1Routes';
import { SellerCenterGetStockError } from '../infrastructure/sellercenter/stockRepositorySellerCenter';

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

function getStockRouteHandler(executor: { execute: (sku: string) => Promise<unknown> }) {
  const router = createStockV1Router(executor as any);
  const stack = (router as any).stack as Array<any>;
  const layer = stack.find((entry) => entry.route?.path === '/:sku');

  if (!layer) {
    throw new Error('Stock route not found in router stack');
  }

  return layer.route.stack[0].handle as (req: any, res: any) => Promise<unknown>;
}

test('smoke: GET /v1/stock/:sku returns 200 JSON on success', async () => {
  const handler = getStockRouteHandler({
    async execute(sku: string) {
      return {
        sku,
        totalQuantity: 2,
        warehouses: [
          {
            sellerWarehouseId: null,
            facilityId: 'GSC-SCBFD321E8A8D71',
            sellerSku: sku,
            quantity: 2
          }
        ]
      };
    }
  });

  const req = {
    params: { sku: '1901928641' },
    method: 'GET',
    originalUrl: '/v1/stock/1901928641',
    headers: {}
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    sku: '1901928641',
    totalQuantity: 2,
    warehouses: [
      {
        sellerWarehouseId: null,
        facilityId: 'GSC-SCBFD321E8A8D71',
        sellerSku: '1901928641',
        quantity: 2
      }
    ]
  });
});

test('smoke: GET /v1/stock/:sku maps FSC 1001 to 404', async () => {
  const handler = getStockRouteHandler({
    async execute() {
      throw new SellerCenterGetStockError(
        'Invalid Seller Sku List: 1901928642',
        'GetStock',
        'Sender',
        '1001',
        'Invalid Seller Sku List: 1901928642'
      );
    }
  });

  const req = {
    params: { sku: '1901928642' },
    method: 'GET',
    originalUrl: '/v1/stock/1901928642',
    headers: {}
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    error: 'SKU no encontrado en Falabella Seller Center',
    details: {
      code: '1001',
      message: 'Invalid Seller Sku List: 1901928642'
    }
  });
});
