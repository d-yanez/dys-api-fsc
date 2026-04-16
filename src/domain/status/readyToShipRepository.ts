export interface ReadyToShipResult {
  ok: true;
  action: 'SetStatusToReadyToShip';
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
}

export interface ReadyToShipErrorResult {
  ok: false;
  action: 'SetStatusToReadyToShip';
  errorCode: string | null;
  errorMessage: string;
}

export interface ReadyToShipRepository {
  setStatusToReadyToShip(input: {
    orderItemIds: string[];
    packageId: string;
  }): Promise<ReadyToShipResult>;
}
