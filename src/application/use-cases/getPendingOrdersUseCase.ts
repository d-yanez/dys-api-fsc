import { OrderRepository } from '../../domain/orders/orderRepository';
import { PendingOrderDto } from '../dtos/pendingOrderDto';

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).replace(/,/g, '');
  const num = Number(str);

  if (Number.isNaN(num)) {
    return null;
  }

  return num;
}

export class GetPendingOrdersUseCase {
  constructor(private readonly orderRepository: OrderRepository) {}

  async execute(): Promise<PendingOrderDto[]> {
    const status = 'pending';

    const orders = await this.orderRepository.getOrdersByStatus(status);

    const result: PendingOrderDto[] = orders.map((order) => {
      // En este punto trabajamos con el "raw" que viene de FSC
      // y lo transformamos a un DTO pensado para el frontend.
      // Se asume estructura similar a la usada en GetOrder.
      const o: any = order.raw;

      const createdAt = o.CreatedAt ?? null;
      const promisedShippingTime = o.PromisedShippingTime ?? null;
      const statusValue = o.Statuses?.Status ?? o.Status ?? null;

      // En GetOrders, el monto total suele venir como Price (sin separador de miles),
      // mientras que GrandTotal puede venir con coma (ej: "28,980.00").
      // Priorizar Price para evitar problemas de parseo.
      let rawGrandTotal =
        o.Price ??
        o.GrandTotal ??
        o.TotalAmount ??
        null;

      if (rawGrandTotal == null && o.Price && typeof o.Price === 'object') {
        const priceObj: any = o.Price as any;
        rawGrandTotal =
          priceObj.Value ??
          priceObj.value ??
          priceObj.Amount ??
          priceObj.amount ??
          priceObj._ ??
          priceObj['#text'] ??
          null;
      }

      const grandTotal = normalizeNumber(rawGrandTotal);

      let currency =
        o.Currency ??
        o.CurrencyCode ??
        o.PriceCurrency ??
        null;

      if (!currency && o.Price && typeof o.Price === 'object') {
        const priceObj: any = o.Price as any;
        currency =
          priceObj.Currency ??
          priceObj.currency ??
          priceObj.CurrencyCode ??
          null;
      }

      const firstName = o.CustomerFirstName ?? '';
      const lastName = o.CustomerLastName ?? '';
      const fullName = `${firstName} ${lastName}`.trim() || null;

      const dto: PendingOrderDto = {
        orderId: String(o.OrderId ?? order.orderId),
        orderNumber:
          o.OrderNumber != null ? String(o.OrderNumber) : null,
        status: statusValue != null ? String(statusValue) : null,
        createdAt,
        promisedShippingTime,
        grandTotal,
        currency,
        customerName: fullName,
      };

      return dto;
    });

    return result;
  }
}
