export interface UpdateStockRequestDto {
  sellerSku: string;
  quantity: number;
}

export interface UpdateStockResponseDto {
  success: boolean;
  status: 'accepted';
  action: 'UpdateStock';
  sellerSku: string;
  quantity: number;
  facilityId: string;
  feedId: string;
}
