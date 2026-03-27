export interface StockWarehouse {
  sellerWarehouseId: string | null;
  facilityId: string | null;
  sellerSku: string;
  quantity: number;
}

export interface StockBySku {
  sku: string;
  totalQuantity: number;
  warehouses: StockWarehouse[];
}
