import test from 'node:test';
import assert from 'node:assert/strict';
import { StockUpdateController } from '../interfaces/http/controllers/stockUpdateController';
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

test('StockUpdateController returns 400 for invalid quantity', async () => {
  const controller = new StockUpdateController({
    async execute() {
      throw new Error('Invalid quantity');
    }
  });

  const req = {
    body: { sellerSku: '3516192124', quantity: -1 },
    method: 'PUT',
    originalUrl: '/v1/stock',
    headers: {}
  } as any;

  const res = createMockResponse();
  await controller.updateStock(req, res as any);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid quantity' });
});

test('StockUpdateController returns 404 for FSC ErrorResponse code 1001', async () => {
  const controller = new StockUpdateController({
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
  } as any;

  const res = createMockResponse();
  await controller.updateStock(req, res as any);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    error: 'SKU no encontrado en Falabella Seller Center',
    details: {
      code: '1001',
      message: 'Invalid Seller Sku List: 3516192124'
    }
  });
});

test('StockUpdateController returns 200 on accepted update', async () => {
  const controller = new StockUpdateController({
    async execute() {
      return {
        success: true,
        status: 'accepted',
        action: 'UpdateStock',
        sellerSku: '3516192124',
        quantity: 3,
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
  } as any;

  const res = createMockResponse();
  await controller.updateStock(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    status: 'accepted',
    action: 'UpdateStock',
    sellerSku: '3516192124',
    quantity: 3,
    facilityId: 'GSC-SCBFD321E8A8D71',
    feedId: 'feed-123'
  });
});
