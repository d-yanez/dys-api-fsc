import { OrderRepository } from '../../domain/orders/orderRepository';
import { Order } from '../../domain/orders/order';

export class GetOrderByIdUseCase {
  constructor(private readonly orderRepository: OrderRepository) {}

  async execute(orderId: string): Promise<Order> {
    if (!orderId || !/^\d+$/.test(orderId)) {
      throw new Error('Invalid orderId');
    }
    return this.orderRepository.getOrderById(orderId);
  }
}