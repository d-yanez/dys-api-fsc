import { OrderItem } from './orderItem';
import { SetStatusToPackedResult } from './setStatusToPackedResult';

export interface OrderItemRepository {
  getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]>;
  setStatusToPackedByMarketplace(orderItemIds: string[]): Promise<SetStatusToPackedResult>;
}
