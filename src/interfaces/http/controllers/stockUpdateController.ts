import { Request, Response } from 'express';
import { logger } from '../../../infrastructure/logger/logger';
import { SellerCenterUpdateStockError } from '../../../infrastructure/sellercenter/stockRepositorySellerCenter';

interface UpdateStockExecutor {
  execute(input: { sellerSku: string; quantity: number }): Promise<unknown>;
}

export class StockUpdateController {
  constructor(private readonly updateStockUseCase: UpdateStockExecutor) {}

  updateStock = async (req: Request, res: Response) => {
    const sellerSku = String(req.body?.sellerSku ?? '').trim();
    const quantity = Number(req.body?.quantity);

    try {
      const result = await this.updateStockUseCase.execute({ sellerSku, quantity });
      return res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      logger.error(
        {
          err: message,
          endpoint: '/v1/stock',
          method: req.method,
          url: req.originalUrl,
          requestId: req.headers['x-request-id'],
          sellerSku,
          quantity,
          fscErrorCode:
            err instanceof SellerCenterUpdateStockError ? err.errorCode : undefined
        },
        '❌ Error in StockUpdateController.updateStock'
      );

      if (message === 'Invalid sellerSku' || message === 'Invalid quantity') {
        return res.status(400).json({ error: message });
      }

      if (
        err instanceof SellerCenterUpdateStockError &&
        err.errorCode === '1001' &&
        String(err.errorMessage ?? '').toLowerCase().includes('invalid seller sku')
      ) {
        return res.status(404).json({
          error: 'SKU no encontrado en Falabella Seller Center',
          details: {
            code: err.errorCode,
            message: err.errorMessage ?? err.message
          }
        });
      }

      if (
        err instanceof SellerCenterUpdateStockError ||
        message.startsWith('SellerCenter UpdateStock HTTP')
      ) {
        return res.status(502).json({
          error: 'Error consultando Falabella Seller Center UpdateStock'
        });
      }

      return res.status(500).json({
        error: 'Error interno actualizando stock'
      });
    }
  };
}

export type { UpdateStockExecutor };
