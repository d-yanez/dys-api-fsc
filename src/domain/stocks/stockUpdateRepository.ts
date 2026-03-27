export interface UpdateStockResult {
  success: boolean;
  status: 'accepted';
  action: 'UpdateStock';
  sellerSku: string;
  quantity: number;
  facilityId: string;
  feedId: string;
}

export interface StockUpdateRepository {
  updateStock(input: { sellerSku: string; quantity: number }): Promise<UpdateStockResult>;
}
