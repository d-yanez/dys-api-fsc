import { Router } from 'express';
import { ReadyToShipRepositorySellerCenter } from '../../../infrastructure/sellercenter/readyToShipRepositorySellerCenter';
import { SetStatusToReadyToShipUseCase } from '../../../application/use-cases/setStatusToReadyToShipUseCase';
import {
  ReadyToShipStatusController,
  SetStatusToReadyToShipExecutor
} from '../controllers/readyToShipStatusController';

export function createStatusV1Router(
  executor?: SetStatusToReadyToShipExecutor
): Router {
  const router = Router();

  const useCase =
    executor ?? new SetStatusToReadyToShipUseCase(new ReadyToShipRepositorySellerCenter());
  const controller = new ReadyToShipStatusController(useCase);

  router.post('/ready-to-ship', controller.setStatusToReadyToShip);

  return router;
}

const statusV1Router = createStatusV1Router();

export { statusV1Router };
