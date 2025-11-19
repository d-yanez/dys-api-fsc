import { OrderItemRepository } from '../../domain/orders/orderItemRepository';
import { OrderItem } from '../../domain/orders/orderItem';
import { buildSignedUrl, httpGet } from './sellerCenterClient';
import { logger } from '../logger/logger';
import { env } from '../config/env';
import { XMLParser } from 'fast-xml-parser';

export class OrderItemRepositorySellerCenter implements OrderItemRepository {
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
  }

  async getOrderItemsByOrderId(orderId: string): Promise<OrderItem[]> {
    const { url } = buildSignedUrl({
      Action: 'GetOrderItems',
      OrderId: orderId,
    });

    const { status, body } = await httpGet(url);

    if (status !== 200) {
      logger.error({ status, bodySnippet: body.slice(0, 300) }, '❌ Non-200 response from Seller Center GetOrderItems');
      throw new Error(`SellerCenter GetOrderItems HTTP ${status}`);
    }

    const format = (env.scFormat ?? 'XML').toUpperCase();
    let itemsNode: any;

    try {
      if (format === 'JSON') {
        const parsedJson = JSON.parse(body) as any;
        itemsNode = parsedJson?.SuccessResponse?.Body?.OrderItems?.OrderItem;
      } else {
        const parsedXml = this.xmlParser.parse(body) as any;
        itemsNode = parsedXml?.SuccessResponse?.Body?.OrderItems?.OrderItem;
      }

      // Fallback inverso por si el formato declarado no coincide con la respuesta real
      if (!itemsNode) {
        logger.warn({ format, bodySnippet: body.slice(0, 200) }, '⚠️ OrderItems not found with primary parser, trying fallback');

        if (format === 'JSON') {
          const parsedXml = this.xmlParser.parse(body) as any;
          itemsNode = parsedXml?.SuccessResponse?.Body?.OrderItems?.OrderItem;
        } else {
          const parsedJson = JSON.parse(body) as any;
          itemsNode = parsedJson?.SuccessResponse?.Body?.OrderItems?.OrderItem;
        }
      }
    } catch (err: any) {
      logger.error(
        { err: err?.message ?? err, bodySnippet: body.slice(0, 500) },
        '❌ Failed to parse Seller Center GetOrderItems response (JSON/XML)'
      );
      throw new Error('Failed to parse Seller Center GetOrderItems response (JSON/XML).');
    }

    if (!itemsNode) {
      logger.error({ bodySnippet: body.slice(0, 500) }, '❌ No OrderItems data in Seller Center response');
      throw new Error('OrderItems not found in Seller Center response');
    }

    const itemsArray = Array.isArray(itemsNode) ? itemsNode : [itemsNode];

    const result: OrderItem[] = itemsArray.map((it: any): OrderItem => {
      // ExtraAttributes puede venir como JSON string
      let extraAttrs: any = null;
      if (typeof it.ExtraAttributes === 'string' && it.ExtraAttributes.trim() !== '') {
        try {
          extraAttrs = JSON.parse(it.ExtraAttributes);
        } catch {
          extraAttrs = null;
        }
      }

      const quantity = it.Quantity != null ? Number(it.Quantity) : null;

      // Algunos campos de monto típicos en GetOrderItems: ItemPrice, PaidPrice, ShippingAmount :contentReference[oaicite:1]{index=1}
      const price = it.ItemPrice != null ? Number(it.ItemPrice) : null;
      const paidPrice = it.PaidPrice != null ? Number(it.PaidPrice) : null;
      const shippingAmount = it.ShippingAmount != null ? Number(it.ShippingAmount) : null;

      const orderItem: OrderItem = {
        orderItemId: String(it.OrderItemId),
        orderId: String(it.OrderId ?? orderId),
        orderNumber: it.OrderNumber != null ? String(it.OrderNumber) : null,

        sku: it.Sku ?? null,
        shopSku: it.ShopSku ?? null,
        name: it.Name ?? null,
        variation: it.Variation ?? null,

        quantity,
        price,
        paidPrice,
        shippingAmount,
        currency: it.Currency ?? null,
        voucherCode: it.VoucherCode ?? null,

        status: it.Status ?? null,
        isProcessable: it.isProcessable ?? null,
        shippingType: it.ShippingType ?? null,
        shipmentProvider: it.ShipmentProvider ?? null,
        shippingProviderType: it.ShippingProviderType ?? null,

        isDigital: it.IsDigital ?? null,
        digitalDeliveryInfo: it.DigitalDeliveryInfo ?? null,

        trackingCode: it.TrackingCode ?? null,
        trackingCodePre: it.TrackingCodePre ?? null,

        reason: it.Reason ?? null,
        reasonDetail: it.ReasonDetail ?? null,

        purchaseOrderId: it.PurchaseOrderId ?? null,
        purchaseOrderNumber: it.PurchaseOrderNumber ?? null,
        packageId: it.PackageId ?? null,

        promisedShippingTime: it.PromisedShippingTime ?? null,

        extraAttributes: extraAttrs,
      };

      return orderItem;
    });

    return result;
  }
}
