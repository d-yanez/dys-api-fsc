import { Router } from 'express';
import { StockRepositorySellerCenter } from '../../../infrastructure/sellercenter/stockRepositorySellerCenter';
import { UpdateStockUseCase } from '../../../application/use-cases/updateStockUseCase';
import { StockUpdateController, UpdateStockExecutor } from '../controllers/stockUpdateController';

export function createStockUpdateV1Router(executor?: UpdateStockExecutor): Router {
  const router = Router();

  const useCase = executor ?? new UpdateStockUseCase(new StockRepositorySellerCenter());
  const controller = new StockUpdateController(useCase);

  router.put('/', controller.updateStock);

  return router;
}

const stockUpdateV1Router = createStockUpdateV1Router();

export { stockUpdateV1Router };
