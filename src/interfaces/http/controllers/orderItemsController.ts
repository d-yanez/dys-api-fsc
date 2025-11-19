import { Request, Response } from 'express';
import { GetOrderItemsByOrderIdUseCase } from '../../../application/use-cases/getOrderItemsByOrderIdUseCase';
import { logger } from '../../../infrastructure/logger/logger';

export class OrderItemsController {
  constructor(private readonly getOrderItemsByOrderIdUseCase: GetOrderItemsByOrderIdUseCase) {}

  getOrderItemsByOrderId = async (req: Request, res: Response) => {
    const { orderId } = req.params;

    try {
      const items = await this.getOrderItemsByOrderIdUseCase.execute(orderId);

      if (!items.length) {
        return res.status(404).json({ error: 'No items found for order' });
      }

      // Derivamos algunos datos comunes desde el primer item
      const base = items[0];

      const response = {
        orderId: base.orderId,
        orderNumber: base.orderNumber ?? null,
        shippingType: base.shippingType ?? null,
        currency: base.currency ?? null,
        items: items.map((it) => ({
          orderItemId: it.orderItemId,
          name: it.name,
          sku: it.sku,
          shopSku: it.shopSku,
          variation: it.variation,
          quantity: it.quantity,
          price: it.price,
          paidPrice: it.paidPrice,
          shippingAmount: it.shippingAmount,
          status: it.status,
          isProcessable: it.isProcessable,
          shippingType: it.shippingType,
          shipmentProvider: it.shipmentProvider,
          shippingProviderType: it.shippingProviderType,
          voucherCode: it.voucherCode,
          isDigital: it.isDigital,
          digitalDeliveryInfo: it.digitalDeliveryInfo,
          trackingCode: it.trackingCode,
          trackingCodePre: it.trackingCodePre,
          reason: it.reason,
          reasonDetail: it.reasonDetail,
          purchaseOrderId: it.purchaseOrderId,
          purchaseOrderNumber: it.purchaseOrderNumber,
          packageId: it.packageId,
          promisedShippingTime: it.promisedShippingTime,
          extraAttributes: it.extraAttributes,
        })),
      };

      return res.status(200).json(response);
    } catch (err: any) {
      logger.error(
        {
          err: err?.message ?? err,
          orderId,
        },
        '❌ Error in OrderItemsController.getOrderItemsByOrderId'
      );

      if (err?.message === 'Invalid orderId') {
        return res.status(400).json({ error: 'orderId inválido' });
      }

      return res.status(502).json({ error: 'Error consultando Falabella Seller Center GetOrderItems' });
    }
  };
}
