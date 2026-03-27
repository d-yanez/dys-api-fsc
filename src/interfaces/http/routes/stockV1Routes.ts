import { Router } from 'express';
import { StockRepositorySellerCenter } from '../../../infrastructure/sellercenter/stockRepositorySellerCenter';
import { GetStockBySkuUseCase } from '../../../application/use-cases/getStockBySkuUseCase';
import { StockController, GetStockBySkuExecutor } from '../controllers/stockController';

export function createStockV1Router(executor?: GetStockBySkuExecutor): Router {
  const router = Router();

  const useCase = executor ?? new GetStockBySkuUseCase(new StockRepositorySellerCenter());
  const controller = new StockController(useCase);

  router.get('/:sku', controller.getStockBySku);

  return router;
}

const stockV1Router = createStockV1Router();

export { stockV1Router };
