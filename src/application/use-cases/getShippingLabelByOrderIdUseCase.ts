// src/application/use-cases/getShippingLabelByOrderIdUseCase.ts

import { OrderItemRepository } from "../../domain/orders/orderItemRepository";
import { OrderItem } from "../../domain/orders/orderItem";
import { DocumentRepository } from "../../domain/documents/documentRepository";

export interface GetShippingLabelByOrderIdResult {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export class GetShippingLabelByOrderIdUseCase {
  constructor(
    private readonly orderItemRepository: OrderItemRepository,
    private readonly documentRepository: DocumentRepository
  ) {}

  async execute(orderId: string): Promise<GetShippingLabelByOrderIdResult> {
    if (!orderId) {
      throw new Error("orderId is required");
    }

    // 1) obtener items de la orden
    const items: OrderItem[] =
      await this.orderItemRepository.getOrderItemsByOrderId(orderId);

    if (!items || items.length === 0) {
      throw new Error(`Order ${orderId} has no items`);
    }

    // 2) extraer orderItemIds
    const orderItemIds = items.map((i) => i.orderItemId).filter(Boolean);

    if (orderItemIds.length === 0) {
      throw new Error(`Order ${orderId} has items but no OrderItemId values`);
    }

    // 3) pedir etiqueta a Seller Center
    const label = await this.documentRepository.getShippingLabel(orderItemIds);

    if (!label) {
      throw new Error("Shipping label not found");
    }

    const mimeType = label.mimeType || "application/pdf";
    const fileName = `label_order_${orderId}.pdf`;

    return {
      buffer: label.fileBuffer,
      mimeType,
      fileName,
    };
  }
}
