import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatusV1Router } from '../interfaces/http/routes/statusV1Routes';
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

function getReadyToShipRouteHandler(executor: {
  execute: (input: { orderItemIds: Array<string | number>; packageId: string }) => Promise<unknown>;
}) {
  const router = createStatusV1Router(executor as any);
  const stack = (router as any).stack as Array<any>;
  const layer = stack.find((entry) => entry.route?.path === '/ready-to-ship' && entry.route?.methods?.post);

  if (!layer) {
    throw new Error('Ready-to-ship route not found in router stack');
  }

  return layer.route.stack[0].handle as (req: any, res: any) => Promise<unknown>;
}

test('smoke: POST /v1/status/ready-to-ship returns success payload', async () => {
  const handler = getReadyToShipRouteHandler({
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
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).ok, true);
});

test('smoke: POST /v1/status/ready-to-ship maps FSC functional error to 400', async () => {
  const handler = getReadyToShipRouteHandler({
    async execute() {
      throw new SellerCenterReadyToShipError('E020: Invalid Order Item ID', '20', 'E020: Invalid Order Item ID');
    }
  });

  const req = {
    body: { orderItemIds: [163398544], packageId: 'PKG00002CZXL5' },
    method: 'POST',
    originalUrl: '/v1/status/ready-to-ship',
    headers: {}
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 400);
  assert.equal((res.body as any).ok, false);
  assert.equal((res.body as any).errorCode, '20');
});
