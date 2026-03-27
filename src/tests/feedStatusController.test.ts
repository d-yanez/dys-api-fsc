import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedStatusController } from '../interfaces/http/controllers/feedStatusController';
import { SellerCenterFeedStatusError } from '../infrastructure/sellercenter/stockRepositorySellerCenter';

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

test('FeedStatusController returns 400 for invalid feedId', async () => {
  const controller = new FeedStatusController({
    async execute() {
      throw new Error('Invalid feedId');
    }
  });

  const req = {
    params: { feedId: 'bad' },
    method: 'GET',
    originalUrl: '/v1/feed/status/bad',
    headers: {}
  } as any;

  const res = createMockResponse();
  await controller.getFeedStatus(req, res as any);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'feedId inválido' });
});

test('FeedStatusController returns 404 when FSC says feed not found', async () => {
  const controller = new FeedStatusController({
    async execute() {
      throw new SellerCenterFeedStatusError(
        'Feed not found',
        'FeedStatus',
        'Sender',
        '4040',
        'Feed not found'
      );
    }
  });

  const req = {
    params: { feedId: '90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c' },
    method: 'GET',
    originalUrl: '/v1/feed/status/90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c',
    headers: {}
  } as any;

  const res = createMockResponse();
  await controller.getFeedStatus(req, res as any);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    error: 'Feed no encontrado en Falabella Seller Center',
    details: {
      code: '4040',
      message: 'Feed not found'
    }
  });
});

test('FeedStatusController returns 200 on success', async () => {
  const controller = new FeedStatusController({
    async execute() {
      return {
        success: true,
        feedId: '90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c',
        status: 'Finished',
        action: 'ProductStockUpdate',
        creationDate: '2026-03-26 23:35:38',
        updatedDate: '2026-03-26 23:35:39',
        source: 'api',
        totalRecords: 1,
        processedRecords: 1,
        failedRecords: 0
      };
    }
  });

  const req = {
    params: { feedId: '90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c' },
    method: 'GET',
    originalUrl: '/v1/feed/status/90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c',
    headers: {}
  } as any;

  const res = createMockResponse();
  await controller.getFeedStatus(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).status, 'Finished');
});
