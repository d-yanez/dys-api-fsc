import { Order } from './order';

export interface OrderRepository {
  getOrderById(orderId: string): Promise<Order>;
}