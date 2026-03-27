import test from 'node:test';
import assert from 'node:assert/strict';
import { GetStockBySkuUseCase } from '../application/use-cases/getStockBySkuUseCase';
import { StockRepository } from '../domain/stocks/stockRepository';

test('GetStockBySkuUseCase returns stock payload for a valid numeric sku', async () => {
  const repo: StockRepository = {
    async getStockBySku(sku: string) {
      return {
        sku,
        totalQuantity: 2,
        warehouses: [
          {
            sellerWarehouseId: null,
            facilityId: 'FAC-1',
            sellerSku: sku,
            quantity: 2
          }
        ]
      };
    }
  };

  const useCase = new GetStockBySkuUseCase(repo);
  const result = await useCase.execute('1901928641');

  assert.equal(result.sku, '1901928641');
  assert.equal(result.totalQuantity, 2);
  assert.equal(result.warehouses.length, 1);
});

test('GetStockBySkuUseCase throws for non numeric sku', async () => {
  const repo: StockRepository = {
    async getStockBySku() {
      throw new Error('should not be called');
    }
  };

  const useCase = new GetStockBySkuUseCase(repo);

  await assert.rejects(async () => useCase.execute('sku-abc'), {
    message: 'Invalid sku'
  });
});
