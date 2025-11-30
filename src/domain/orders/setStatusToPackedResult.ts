export interface PackedOrderItem {
  orderItemId: string;
  shipmentProvider: string | null;
  trackingNumber: string | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
  packageId: string | null;
}

export interface SetStatusToPackedResult {
  success: boolean;
  orderItems: PackedOrderItem[];
  updatedOrderItemIds: string[];
  failedOrderItemIds: { orderItemId: string; reason: string }[];
}

