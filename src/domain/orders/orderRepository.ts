import { Order } from './order';

export interface OrderRepository {
  getOrderById(orderId: string): Promise<Order>;
  getOrdersByStatus(status: string): Promise<Order[]>;
}
