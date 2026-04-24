import { Request, Response } from 'express';
import { GetOrderByIdUseCase } from '../../../application/use-cases/getOrderByIdUseCase';
import { logger } from '../../../infrastructure/logger/logger';

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).replace(/,/g, '').trim();
  if (str === '') {
    return null;
  }
  const num = Number(str);
  return Number.isNaN(num) ? null : num;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') {
      return true;
    }
    if (v === 'false') {
      return false;
    }
  }
  return null;
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === 'object') {
      return first as Record<string, unknown>;
    }
    return null;
  }
  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return null;
}

export class OrderController {
  constructor(private readonly getOrderByIdUseCase: GetOrderByIdUseCase) {}

  getOrderById = async (req: Request, res: Response) => {
    const { orderId } = req.params;

    try {
      const order = await this.getOrderByIdUseCase.execute(orderId);
      const o = order.raw;

      if (process.env.DEBUG_SHAPE === 'true') {
        logger.info(
          {
            scVersion: process.env.SC_VERSION,
            orderKeys: Object.keys(o || {}),
            itemsCount: o?.ItemsCount,
            warehouse: o?.Warehouse,
            warehouseKeys: Array.isArray(o?.Warehouse)
              ? Object.keys(o.Warehouse[0] || {})
              : Object.keys(o?.Warehouse || {})
          },
          '🔎 GetOrder raw shape (debug)'
        );
      }

      // Parseamos ExtraAttributes si viene en string JSON para que no falle
      let extraAttributes: any = null;
      if (typeof o.ExtraAttributes === 'string' && o.ExtraAttributes.trim() !== '') {
        try {
          extraAttributes = JSON.parse(o.ExtraAttributes);
        } catch {
          extraAttributes = null;
        }
      }
      const extraBillingAttributes = firstObject(o.ExtraBillingAttributes);

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

        invoiceRequired: normalizeBoolean(o.InvoiceRequired),
        financial: {
          grandTotal: normalizeNumber(o.GrandTotal ?? o.Price ?? null),
          productTotal: normalizeNumber(o.ProductTotal ?? null),
          taxAmount: normalizeNumber(o.TaxAmount ?? null),
          shippingFeeTotal: normalizeNumber(o.ShippingFeeTotal ?? null)
        },

        customer: {
          firstName: o.CustomerFirstName ?? null,
          lastName: o.CustomerLastName ?? null,
          nationalRegistrationNumber: o.NationalRegistrationNumber ?? null,
          legalId: extraBillingAttributes?.LegalId ?? null,
          fiscalPerson: extraBillingAttributes?.FiscalPerson ?? null,
          documentType: extraBillingAttributes?.DocumentType ?? null,
          receiverLegalName: extraBillingAttributes?.ReceiverLegalName ?? null,
          receiverTypeRegimen: extraBillingAttributes?.ReceiverTypeRegimen ?? null,
          receiverEmail: extraBillingAttributes?.ReceiverEmail ?? null,
          receiverAddress: extraBillingAttributes?.ReceiverAddress ?? null,
          receiverMunicipality: extraBillingAttributes?.ReceiverMunicipality ?? null
        },

        shippingAddress: o.AddressShipping ?? null,
        billingAddress: o.AddressBilling ?? null,
        addressShipping: o.AddressShipping ?? null,
        addressBilling: o.AddressBilling ?? null,

        warehouse: o.Warehouse
          ? {
              facilityId: o.Warehouse.FacilityId ?? null,
              sellerWarehouseId: o.Warehouse.SellerWarehouseId ?? null
            }
          : null,

        extraAttributes,
        extraBillingAttributes
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
