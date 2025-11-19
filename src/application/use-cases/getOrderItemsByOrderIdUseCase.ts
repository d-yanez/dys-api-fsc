import { OrderItemRepository } from '../../domain/orders/orderItemRepository';
import { OrderItem } from '../../domain/orders/orderItem';

export class GetOrderItemsByOrderIdUseCase {
  constructor(private readonly orderItemRepository: OrderItemRepository) {}

  async execute(orderId: string): Promise<OrderItem[]> {
    if (!orderId || !/^\d+$/.test(orderId)) {
      throw new Error('Invalid orderId');
    }
    return this.orderItemRepository.getOrderItemsByOrderId(orderId);
  }
}
