export interface PendingOrderDto {
  orderId: string;
  orderNumber: string | null;
  status: string | null;
  createdAt: string | null;
  promisedShippingTime: string | null;
  grandTotal: number | null;
  currency: string | null;
  customerName: string | null;
}

