import { Router } from 'express';
import { OrderRepositorySellerCenter } from '../../../infrastructure/sellercenter/orderRepositorySellerCenter';
import { GetPendingOrdersUseCase } from '../../../application/use-cases/getPendingOrdersUseCase';
import { OrdersController } from '../controllers/ordersController';

const router = Router();

// Wiring
const orderRepo = new OrderRepositorySellerCenter();
const getPendingOrdersUseCase = new GetPendingOrdersUseCase(orderRepo);
const ordersController = new OrdersController(getPendingOrdersUseCase);

router.get('/', ordersController.getPendingOrders);

export { router as ordersRouter };

