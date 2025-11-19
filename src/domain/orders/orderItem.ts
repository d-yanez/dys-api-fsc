export interface OrderItem {
  orderItemId: string;
  orderId: string;
  orderNumber?: string | null;

  sku?: string | null;
  shopSku?: string | null;
  name?: string | null;
  variation?: string | null;

  quantity?: number | null;

  price?: number | null;
  paidPrice?: number | null;
  shippingAmount?: number | null;
  currency?: string | null;
  voucherCode?: string | null;

  status?: string | null;
  isProcessable?: string | null; // "0" | "1"
  shippingType?: string | null;
  shipmentProvider?: string | null;
  shippingProviderType?: string | null;

  isDigital?: string | null; // "0" | "1"
  digitalDeliveryInfo?: string | null;

  trackingCode?: string | null;
  trackingCodePre?: string | null;

  reason?: string | null;
  reasonDetail?: string | null;

  purchaseOrderId?: string | null;
  purchaseOrderNumber?: string | null;
  packageId?: string | null;

  promisedShippingTime?: string | null;

  extraAttributes?: any;
}
