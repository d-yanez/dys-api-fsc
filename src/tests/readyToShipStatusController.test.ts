import test from 'node:test';
import assert from 'node:assert/strict';
import { ReadyToShipStatusController } from '../interfaces/http/controllers/readyToShipStatusController';
import { SellerCenterReadyToShipError } from '../infrastructure/sellercenter/readyToShipRepositorySellerCenter';

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

test('ReadyToShipStatusController returns 400 for validation errors', async () => {
  const controller = new ReadyToShipStatusController({
    async execute() {
      throw new Error('Invalid orderItemIds');
    }
  });

  const req = {
    body: { orderItemIds: [], packageId: 'PKG00002CZXL5' },
    method: 'POST',
    originalUrl: '/v1/status/ready-to-ship',
    headers: {}
  } as any;
  const res = createMockResponse();

  await controller.setStatusToReadyToShip(req, res as any);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    ok: false,
    action: 'SetStatusToReadyToShip',
    errorCode: 'VALIDATION_ERROR',
    errorMessage: 'Invalid orderItemIds'
  });
});

test('ReadyToShipStatusController maps FSC functional errors to 400', async () => {
  const controller = new ReadyToShipStatusController({
    async execute() {
      throw new SellerCenterReadyToShipError('E020: Invalid Order Item ID', '20', 'E020: Invalid Order Item ID');
    }
  });

  const req = {
    body: { orderItemIds: [163398544], packageId: 'PKG00002CZXL5' },
    method: 'POST',
    originalUrl: '/v1/status/ready-to-ship',
    headers: {}
  } as any;
  const res = createMockResponse();

  await controller.setStatusToReadyToShip(req, res as any);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    ok: false,
    action: 'SetStatusToReadyToShip',
    errorCode: '20',
    errorMessage: 'E020: Invalid Order Item ID'
  });
});

test('ReadyToShipStatusController returns 200 on success', async () => {
  const controller = new ReadyToShipStatusController({
    async execute() {
      return {
        ok: true,
        action: 'SetStatusToReadyToShip',
        purchaseOrderId: '1150140518',
        purchaseOrderNumber: '3231960534'
      };
    }
  });

  const req = {
    body: { orderItemIds: [163398544], packageId: 'PKG00002CZXL5' },
    method: 'POST',
    originalUrl: '/v1/status/ready-to-ship',
    headers: {}
  } as any;
  const res = createMockResponse();

  await controller.setStatusToReadyToShip(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    action: 'SetStatusToReadyToShip',
    purchaseOrderId: '1150140518',
    purchaseOrderNumber: '3231960534'
  });
});
