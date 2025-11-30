import { OrderItemRepository } from '../../domain/orders/orderItemRepository';
import { GetOrderItemsByOrderIdUseCase } from './getOrderItemsByOrderIdUseCase';
import { SetOrderItemsPackedResponseDto } from '../dtos/setOrderItemsPackedDto';

interface Input {
  orderId: string;
}

export class SetOrderItemsPackedUseCase {
  constructor(
    private readonly orderItemRepository: OrderItemRepository,
    private readonly getOrderItemsByOrderIdUseCase: GetOrderItemsByOrderIdUseCase
  ) {}

  async execute(input: Input): Promise<SetOrderItemsPackedResponseDto> {
    const { orderId } = input;

    if (!orderId || !/^\d+$/.test(orderId)) {
      throw new Error('Invalid orderId');
    }

    const items = await this.getOrderItemsByOrderIdUseCase.execute(orderId);

    if (!items || items.length === 0) {
      throw new Error('No items found for order');
    }

    const orderItemIds = items.map((it: { orderItemId: string }) =>
      String(it.orderItemId)
    );

    const packedResult = await this.orderItemRepository.setStatusToPackedByMarketplace(orderItemIds);

    return {
      orderId,
      orderItems: packedResult.orderItems
    };
  }
}
