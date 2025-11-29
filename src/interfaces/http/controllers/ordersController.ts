import { Request, Response } from 'express';
import { GetPendingOrdersUseCase } from '../../../application/use-cases/getPendingOrdersUseCase';
import { logger } from '../../../infrastructure/logger/logger';

export class OrdersController {
  constructor(
    private readonly getPendingOrdersUseCase: GetPendingOrdersUseCase
  ) {}

  getPendingOrders = async (req: Request, res: Response) => {
    try {
      const orders = await this.getPendingOrdersUseCase.execute();

      return res.status(200).json(orders);
    } catch (err: any) {
      logger.error(
        {
          err: err?.message ?? err,
          endpoint: '/orders',
          method: req.method,
          url: req.originalUrl,
          requestId: req.headers['x-request-id']
        },
        '❌ Error in OrdersController.getPendingOrders'
      );

      return res
        .status(502)
        .json({ error: 'Error consultando Falabella Seller Center GetOrders' });
    }
  };
}

