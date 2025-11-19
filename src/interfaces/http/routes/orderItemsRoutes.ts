import { Router } from 'express';
import { OrderItemRepositorySellerCenter } from '../../../infrastructure/sellercenter/orderItemRepositorySellerCenter';
import { GetOrderItemsByOrderIdUseCase } from '../../../application/use-cases/getOrderItemsByOrderIdUseCase';
import { OrderItemsController } from '../controllers/orderItemsController';

const router = Router();

const orderItemRepo = new OrderItemRepositorySellerCenter();
const getOrderItemsByOrderIdUseCase = new GetOrderItemsByOrderIdUseCase(orderItemRepo);
const orderItemsController = new OrderItemsController(getOrderItemsByOrderIdUseCase);

router.get('/:orderId', orderItemsController.getOrderItemsByOrderId);

export { router as orderItemsRouter };
