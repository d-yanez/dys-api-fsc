import { Request, Response } from 'express';
import { SetOrderItemsPackedUseCase } from '../../../application/use-cases/setOrderItemsPackedUseCase';
import { logger } from '../../../infrastructure/logger/logger';

export class OrderStatusController {
  constructor(
    private readonly setOrderItemsPackedUseCase: SetOrderItemsPackedUseCase
  ) {}

  markOrderItemsAsPacked = async (req: Request, res: Response) => {
    const { orderId } = req.params;

    try {
      const result = await this.setOrderItemsPackedUseCase.execute({ orderId });

      return res.status(200).json(result);
    } catch (err: any) {
      logger.error(
        {
          err: err?.message ?? err,
          endpoint: '/order/packaged/:orderId',
          method: req.method,
          url: req.originalUrl,
          requestId: req.headers['x-request-id']
        },
        '❌ Error in OrderStatusController.markOrderItemsAsPacked'
      );

      if (err?.message === 'Invalid orderId') {
        return res.status(400).json({ error: 'orderId inválido' });
      }

      if (err?.message === 'No items found for order') {
        return res.status(404).json({ error: 'No items found for order' });
      }

      if (String(err?.message || '').startsWith('SellerCenter SetStatusToPackedByMarketplace HTTP')) {
        return res.status(502).json({
          error: 'Error consultando Falabella Seller Center SetStatusToPackedByMarketplace'
        });
      }

      return res
        .status(500)
        .json({ error: 'Error interno al marcar ítems como packed' });
    }
  };
}

