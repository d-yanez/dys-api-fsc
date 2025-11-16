import { OrderRepository } from '../../domain/orders/orderRepository';
import { Order } from '../../domain/orders/order';
import { buildSignedUrl, httpGet } from './sellerCenterClient';
import { logger } from '../logger/logger';
import { env } from '../config/env';
import { XMLParser } from 'fast-xml-parser';

export class OrderRepositorySellerCenter implements OrderRepository {
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
  }

  async getOrderById(orderId: string): Promise<Order> {
    const { url } = buildSignedUrl({
      Action: 'GetOrder',
      OrderId: orderId
    });

    const { status, body } = await httpGet(url);

    if (status !== 200) {
      logger.error({ status, body }, '❌ Non-200 response from Seller Center GetOrder');
      throw new Error(`SellerCenter GetOrder HTTP ${status}`);
    }

    const format = (env.scFormat ?? 'XML').toUpperCase();

    let orderData: any | undefined;

    try {
      // 1) Intentamos según el formato configurado
      if (format === 'JSON') {
        const parsed = JSON.parse(body) as any;
        orderData = parsed?.SuccessResponse?.Body?.Orders?.Order;
      } else {
        const parsed = this.xmlParser.parse(body) as any;
        orderData = parsed?.SuccessResponse?.Body?.Orders?.Order;
      }

      // 2) Si no se encontró Order, intentamos fallback inverso (por si SC_FORMAT no calza con la respuesta real)
      if (!orderData) {
        logger.warn(
          { format, bodySnippet: body.slice(0, 200) },
          '⚠️ Order data not found with primary parser, trying fallback'
        );

        // Si decía JSON, probamos XML
        if (format === 'JSON') {
          const parsedXml = this.xmlParser.parse(body) as any;
          orderData = parsedXml?.SuccessResponse?.Body?.Orders?.Order;
        } else {
          // Si decía XML, probamos JSON
          const parsedJson = JSON.parse(body) as any;
          orderData = parsedJson?.SuccessResponse?.Body?.Orders?.Order;
        }
      }
    } catch (err: any) {
      logger.error(
        {
          err: err?.message ?? err,
          bodySnippet: body.slice(0, 500)
        },
        '❌ Failed to parse Seller Center response (JSON/XML)'
      );
      throw new Error('Failed to parse Seller Center response (JSON/XML). Revisa SC_FORMAT o la respuesta de la API.');
    }

    if (!orderData) {
      logger.error({ bodySnippet: body.slice(0, 500) }, '❌ No Order data in Seller Center response');
      throw new Error('Order not found in Seller Center response');
    }

    const finalOrder: Order = {
      orderId: String(orderData.OrderId ?? orderId),
      raw: orderData
    };

    return finalOrder;
  }
}