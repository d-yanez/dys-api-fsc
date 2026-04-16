import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReadyToShipRepositorySellerCenter,
  SellerCenterReadyToShipError
} from '../infrastructure/sellercenter/readyToShipRepositorySellerCenter';
import * as sellerCenterClient from '../infrastructure/sellercenter/sellerCenterClient';

const originalHttpPost = sellerCenterClient.httpPost;

test.afterEach(() => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost =
    originalHttpPost;
});

test('ReadyToShipRepositorySellerCenter maps SuccessResponse JSON', async () => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost =
    async () => ({
      status: 200,
      body: JSON.stringify({
        SuccessResponse: {
          Head: {
            RequestAction: 'SetStatusToReadyToShip'
          },
          Body: {
            Orders: {
              Order: {
                PurchaseOrderId: '1150140518',
                PurchaseOrderNumber: '3231960534'
              }
            }
          }
        }
      })
    });

  const repo = new ReadyToShipRepositorySellerCenter();
  const result = await repo.setStatusToReadyToShip({
    orderItemIds: ['163398544'],
    packageId: 'PKG00002CZXL5'
  });

  assert.deepEqual(result, {
    ok: true,
    action: 'SetStatusToReadyToShip',
    purchaseOrderId: '1150140518',
    purchaseOrderNumber: '3231960534'
  });
});

test('ReadyToShipRepositorySellerCenter maps ErrorResponse JSON to typed error', async () => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost =
    async () => ({
      status: 200,
      body: JSON.stringify({
        ErrorResponse: {
          Head: {
            ErrorType: 'Sender',
            ErrorCode: '20',
            ErrorMessage: 'E020: "163398544" Invalid Order Item ID'
          },
          Body: ''
        }
      })
    });

  const repo = new ReadyToShipRepositorySellerCenter();

  await assert.rejects(
    async () =>
      repo.setStatusToReadyToShip({
        orderItemIds: ['163398544'],
        packageId: 'PKG00002CZXL5'
      }),
    (err: unknown) => {
      assert.ok(err instanceof SellerCenterReadyToShipError);
      assert.equal(err.errorCode, '20');
      assert.equal(err.errorMessage, 'E020: "163398544" Invalid Order Item ID');
      return true;
    }
  );
});

test('ReadyToShipRepositorySellerCenter throws on non-200 upstream response', async () => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost =
    async () => ({
      status: 500,
      body: '{"error":"upstream"}'
    });

  const repo = new ReadyToShipRepositorySellerCenter();

  await assert.rejects(
    async () =>
      repo.setStatusToReadyToShip({
        orderItemIds: ['163398544'],
        packageId: 'PKG00002CZXL5'
      }),
    { message: 'SellerCenter SetStatusToReadyToShip HTTP 500' }
  );
});
