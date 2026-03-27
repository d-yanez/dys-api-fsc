import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedStatusV1Router } from '../interfaces/http/routes/feedStatusV1Routes';
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

function getFeedStatusHandler(executor: { execute: (feedId: string) => Promise<unknown> }) {
  const router = createFeedStatusV1Router(executor as any);
  const stack = (router as any).stack as Array<any>;
  const layer = stack.find((entry) => entry.route?.path === '/status/:feedId');

  if (!layer) {
    throw new Error('Feed status route not found in router stack');
  }

  return layer.route.stack[0].handle as (req: any, res: any) => Promise<unknown>;
}

test('smoke: GET /v1/feed/status/:feedId returns 200', async () => {
  const handler = getFeedStatusHandler({
    async execute(feedId: string) {
      return {
        success: true,
        feedId,
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
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any).status, 'Finished');
});

test('smoke: GET /v1/feed/status/:feedId maps not found to 404', async () => {
  const handler = getFeedStatusHandler({
    async execute() {
      throw new SellerCenterFeedStatusError('Feed not found', 'FeedStatus', 'Sender', '4040', 'Feed not found');
    }
  });

  const req = {
    params: { feedId: 'not-found-feed' },
    method: 'GET',
    originalUrl: '/v1/feed/status/not-found-feed',
    headers: {}
  };
  const res = createMockResponse();

  await handler(req, res as any);

  assert.equal(res.statusCode, 404);
});
