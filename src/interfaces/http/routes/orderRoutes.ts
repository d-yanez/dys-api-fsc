import { Router } from 'express';
import { OrderRepositorySellerCenter } from '../../../infrastructure/sellercenter/orderRepositorySellerCenter';
import { OrderItemRepositorySellerCenter } from '../../../infrastructure/sellercenter/orderItemRepositorySellerCenter';
import { GetOrderByIdUseCase } from '../../../application/use-cases/getOrderByIdUseCase';
import { GetOrderItemsByOrderIdUseCase } from '../../../application/use-cases/getOrderItemsByOrderIdUseCase';
import { SetOrderItemsPackedUseCase } from '../../../application/use-cases/setOrderItemsPackedUseCase';
import { OrderController } from '../controllers/orderController';
import { OrderStatusController } from '../controllers/orderStatusController';

const router = Router();

// Wiring
const orderRepo = new OrderRepositorySellerCenter();
const getOrderByIdUseCase = new GetOrderByIdUseCase(orderRepo);
const orderController = new OrderController(getOrderByIdUseCase);

const orderItemRepo = new OrderItemRepositorySellerCenter();
const getOrderItemsByOrderIdUseCase = new GetOrderItemsByOrderIdUseCase(orderItemRepo);
const setOrderItemsPackedUseCase = new SetOrderItemsPackedUseCase(
  orderItemRepo,
  getOrderItemsByOrderIdUseCase
);
const orderStatusController = new OrderStatusController(setOrderItemsPackedUseCase);

router.get('/:orderId', orderController.getOrderById);
router.put('/packaged/:orderId', orderStatusController.markOrderItemsAsPacked);

export { router as orderRouter };
