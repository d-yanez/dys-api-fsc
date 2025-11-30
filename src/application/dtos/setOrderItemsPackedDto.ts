export interface PackedOrderItemDto {
  orderItemId: string;
  shipmentProvider: string | null;
  trackingNumber: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  packageId: string | null;
}

export interface SetOrderItemsPackedResponseDto {
  orderId: string;
  orderItems: PackedOrderItemDto[];
}

