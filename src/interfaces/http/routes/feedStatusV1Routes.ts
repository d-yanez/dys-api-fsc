import { Router } from 'express';
import { StockRepositorySellerCenter } from '../../../infrastructure/sellercenter/stockRepositorySellerCenter';
import { GetFeedStatusUseCase } from '../../../application/use-cases/getFeedStatusUseCase';
import { FeedStatusController, GetFeedStatusExecutor } from '../controllers/feedStatusController';

export function createFeedStatusV1Router(executor?: GetFeedStatusExecutor): Router {
  const router = Router();

  const useCase = executor ?? new GetFeedStatusUseCase(new StockRepositorySellerCenter());
  const controller = new FeedStatusController(useCase);

  router.get('/status/:feedId', controller.getFeedStatus);

  return router;
}

const feedStatusV1Router = createFeedStatusV1Router();

export { feedStatusV1Router };
