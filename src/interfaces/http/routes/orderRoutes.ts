import { Router } from 'express';
import { OrderRepositorySellerCenter } from '../../../infrastructure/sellercenter/orderRepositorySellerCenter';
import { GetOrderByIdUseCase } from '../../../application/use-cases/getOrderByIdUseCase';
import { OrderController } from '../controllers/orderController';

const router = Router();

// Wiring
const orderRepo = new OrderRepositorySellerCenter();
const getOrderByIdUseCase = new GetOrderByIdUseCase(orderRepo);
const orderController = new OrderController(getOrderByIdUseCase);

router.get('/:orderId', orderController.getOrderById);

export { router as orderRouter };