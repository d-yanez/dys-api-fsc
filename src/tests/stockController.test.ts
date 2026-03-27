import test from 'node:test';
import assert from 'node:assert/strict';
import { StockController } from '../interfaces/http/controllers/stockController';
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

test('StockController returns 400 for invalid sku', async () => {
  const controller = new StockController({
    async execute() {
      throw new Error('Invalid sku');
    }
  });

  const req = {
    params: { sku: 'abc' },
    method: 'GET',
    originalUrl: '/v1/stock/abc',
    headers: {}
  } as any;

  const res = createMockResponse();

  await controller.getStockBySku(req, res as any);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'sku inválido' });
});

test('StockController returns 404 for FSC ErrorResponse code 1001', async () => {
  const controller = new StockController({
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
  } as any;

  const res = createMockResponse();

  await controller.getStockBySku(req, res as any);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    error: 'SKU no encontrado en Falabella Seller Center',
    details: {
      code: '1001',
      message: 'Invalid Seller Sku List: 1901928642'
    }
  });
});

test('StockController returns 502 for upstream FSC errors', async () => {
  const controller = new StockController({
    async execute() {
      throw new Error('SellerCenter GetStock HTTP 500');
    }
  });

  const req = {
    params: { sku: '1901928641' },
    method: 'GET',
    originalUrl: '/v1/stock/1901928641',
    headers: {}
  } as any;

  const res = createMockResponse();

  await controller.getStockBySku(req, res as any);

  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, {
    error: 'Error consultando Falabella Seller Center GetStock'
  });
});
