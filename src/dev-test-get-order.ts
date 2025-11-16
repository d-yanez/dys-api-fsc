import { OrderRepositorySellerCenter } from './infrastructure/sellercenter/orderRepositorySellerCenter';
import { logger } from './infrastructure/logger/logger';

(async () => {
  const repo = new OrderRepositorySellerCenter();
  const order = await repo.getOrderById('1130565543');
  logger.info({ order }, 'Test GetOrder');
})();