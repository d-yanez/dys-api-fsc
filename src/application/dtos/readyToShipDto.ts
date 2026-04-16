export interface ReadyToShipRequestDto {
  orderItemIds: Array<string | number>;
  packageId: string;
}

export interface ReadyToShipResponseDto {
  ok: true;
  action: 'SetStatusToReadyToShip';
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
}

export interface ReadyToShipErrorResponseDto {
  ok: false;
  action: 'SetStatusToReadyToShip';
  errorCode: string | null;
  errorMessage: string;
}
