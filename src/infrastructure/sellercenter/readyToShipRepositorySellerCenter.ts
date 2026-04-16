import { ReadyToShipRepository, ReadyToShipResult } from '../../domain/status/readyToShipRepository';
import { buildSignedUrl, httpPost } from './sellerCenterClient';
import { logger } from '../logger/logger';

export class SellerCenterReadyToShipError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: string,
    public readonly errorMessage?: string
  ) {
    super(message);
    this.name = 'SellerCenterReadyToShipError';
  }
}

export class ReadyToShipRepositorySellerCenter implements ReadyToShipRepository {
  async setStatusToReadyToShip(input: {
    orderItemIds: string[];
    packageId: string;
  }): Promise<ReadyToShipResult> {
    const { orderItemIds, packageId } = input;

    const serializedOrderItemIds = `[${orderItemIds.join(',')}]`;

    const { url } = buildSignedUrl({
      Action: 'SetStatusToReadyToShip',
      Version: '1.0',
      Format: 'JSON',
      OrderItemIds: serializedOrderItemIds,
      PackageId: packageId
    });

    const formBody = new URLSearchParams({
      OrderItemIds: serializedOrderItemIds,
      PackageId: packageId
    }).toString();

    const { status, body } = await httpPost(url, formBody, {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    });

    if (status !== 200) {
      logger.error(
        { status, bodySnippet: body.slice(0, 400), orderItemIds, packageId },
        '❌ Non-200 response from Seller Center SetStatusToReadyToShip'
      );
      throw new Error(`SellerCenter SetStatusToReadyToShip HTTP ${status}`);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch (err: any) {
      logger.error(
        { err: err?.message ?? err, bodySnippet: body.slice(0, 500) },
        '❌ Failed to parse Seller Center SetStatusToReadyToShip JSON response'
      );
      throw new Error('Failed to parse Seller Center SetStatusToReadyToShip response');
    }

    const errorHead = parsed?.ErrorResponse?.Head;
    if (errorHead) {
      const code = errorHead?.ErrorCode != null ? String(errorHead.ErrorCode) : undefined;
      const message =
        errorHead?.ErrorMessage != null
          ? String(errorHead.ErrorMessage)
          : 'Seller Center SetStatusToReadyToShip returned ErrorResponse';

      logger.warn(
        {
          orderItemIds,
          packageId,
          errorCode: code,
          errorMessage: message
        },
        '⚠️ Seller Center SetStatusToReadyToShip returned ErrorResponse'
      );

      throw new SellerCenterReadyToShipError(message, code, message);
    }

    const orderNode = parsed?.SuccessResponse?.Body?.Orders?.Order;
    if (!orderNode) {
      throw new Error('Order payload not found in Seller Center SetStatusToReadyToShip response');
    }

    return {
      ok: true,
      action: 'SetStatusToReadyToShip',
      purchaseOrderId:
        orderNode.PurchaseOrderId != null ? String(orderNode.PurchaseOrderId) : null,
      purchaseOrderNumber:
        orderNode.PurchaseOrderNumber != null ? String(orderNode.PurchaseOrderNumber) : null
    };
  }
}
