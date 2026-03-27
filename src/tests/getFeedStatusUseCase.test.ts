import test from 'node:test';
import assert from 'node:assert/strict';
import { GetFeedStatusUseCase } from '../application/use-cases/getFeedStatusUseCase';
import { FeedStatusRepository } from '../domain/stocks/feedStatusRepository';

test('GetFeedStatusUseCase returns feed status for valid feedId', async () => {
  const repo: FeedStatusRepository = {
    async getFeedStatus(feedId: string) {
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
  };

  const useCase = new GetFeedStatusUseCase(repo);
  const result = await useCase.execute('90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c');

  assert.equal(result.success, true);
  assert.equal(result.status, 'Finished');
});

test('GetFeedStatusUseCase throws for invalid feedId', async () => {
  const repo: FeedStatusRepository = {
    async getFeedStatus() {
      throw new Error('should not be called');
    }
  };

  const useCase = new GetFeedStatusUseCase(repo);

  await assert.rejects(async () => useCase.execute('@@invalid@@'), {
    message: 'Invalid feedId'
  });
});
