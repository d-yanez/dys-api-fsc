import { OrderItem } from './orderItem';

export interface OrderItemRepository {
  getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]>;
}
