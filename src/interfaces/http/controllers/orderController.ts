import { Request, Response } from 'express';
import { GetOrderByIdUseCase } from '../../../application/use-cases/getOrderByIdUseCase';
import { logger } from '../../../infrastructure/logger/logger';

export class OrderController {
  constructor(private readonly getOrderByIdUseCase: GetOrderByIdUseCase) {}

  getOrderById = async (req: Request, res: Response) => {
    const { orderId } = req.params;

    try {
      const order = await this.getOrderByIdUseCase.execute(orderId);
      const o = order.raw;

      // Parseamos ExtraAttributes si viene en string JSON para que no falle
      let extraAttributes: any = null;
      if (typeof o.ExtraAttributes === 'string' && o.ExtraAttributes.trim() !== '') {
        try {
          extraAttributes = JSON.parse(o.ExtraAttributes);
        } catch {
          extraAttributes = null;
        }
      }

      // 🔹 Respuesta ligera optimizada
      const response = {
        orderId: String(o.OrderId),
        orderNumber: String(o.OrderNumber),
        status: o.Statuses?.Status ?? null,
        paymentMethod: o.PaymentMethod ?? null,
        createdAt: o.CreatedAt ?? null,
        promisedShippingTime: o.PromisedShippingTime ?? null,
        shippingType: o.ShippingType ?? null,

        totals: {
          grandTotal: o.GrandTotal ?? null,
          productTotal: o.ProductTotal ?? null,
          shippingFeeTotal: o.ShippingFeeTotal ?? null,
          taxAmount: o.TaxAmount ?? null
        },

        customer: {
          firstName: o.CustomerFirstName ?? null,
          lastName: o.CustomerLastName ?? null,
          nationalRegistrationNumber: o.NationalRegistrationNumber ?? null
        },

        shippingAddress: o.AddressShipping ?? null,
        billingAddress: o.AddressBilling ?? null,

        extraAttributes
      };

      return res.status(200).json(response);

      // ------------------------------------------------------------
      // NOTA:
      // Si alguna vez necesitas devolver también el RAW completo
      // puedes agregarlo opcionalmente así:
      // response.raw = o;
      // ------------------------------------------------------------

    } catch (err: any) {
      logger.error(
        {
          err: err?.message ?? err,
          orderId
        },
        '❌ Error in OrderController.getOrderById'
      );

      if (err?.message === 'Invalid orderId') {
        return res.status(400).json({ error: 'orderId inválido' });
      }

      return res.status(502).json({ error: 'Error consultando Falabella Seller Center' });
    }
  };
}