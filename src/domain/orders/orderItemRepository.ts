import { OrderItem } from './orderItem';
import { SetStatusToPackedResult } from './setStatusToPackedResult';

export interface OrderItemRepository {
  getOrderItemsByOrderId(orderId: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<OrderItem[]>;
  setStatusToPackedByMarketplace(orderItemIds: string[]): Promise<SetStatusToPackedResult>;
}
