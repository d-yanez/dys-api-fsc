import test from 'node:test';
import assert from 'node:assert/strict';
import { UpdateStockUseCase } from '../application/use-cases/updateStockUseCase';
import { StockUpdateRepository } from '../domain/stocks/stockUpdateRepository';

test('UpdateStockUseCase returns accepted payload for valid sellerSku and quantity', async () => {
  const repo: StockUpdateRepository = {
    async updateStock(input) {
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
  };

  const useCase = new UpdateStockUseCase(repo);
  const result = await useCase.execute({ sellerSku: '3516192124', quantity: 3 });

  assert.equal(result.success, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.feedId, 'feed-123');
});

test('UpdateStockUseCase throws on invalid inputs', async () => {
  const repo: StockUpdateRepository = {
    async updateStock() {
      throw new Error('should not be called');
    }
  };

  const useCase = new UpdateStockUseCase(repo);

  await assert.rejects(
    async () => useCase.execute({ sellerSku: 'sku-x', quantity: 3 }),
    { message: 'Invalid sellerSku' }
  );

  await assert.rejects(
    async () => useCase.execute({ sellerSku: '3516192124', quantity: -1 }),
    { message: 'Invalid quantity' }
  );
});
