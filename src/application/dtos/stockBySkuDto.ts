export interface StockWarehouseDto {
  sellerWarehouseId: string | null;
  facilityId: string | null;
  sellerSku: string;
  quantity: number;
}

export interface StockBySkuDto {
  sku: string;
  totalQuantity: number;
  warehouses: StockWarehouseDto[];
}
