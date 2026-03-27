import { Request, Response } from 'express';
import { logger } from '../../../infrastructure/logger/logger';
import { SellerCenterGetStockError } from '../../../infrastructure/sellercenter/stockRepositorySellerCenter';

interface GetStockBySkuExecutor {
  execute(sku: string): Promise<unknown>;
}

export class StockController {
  constructor(private readonly getStockBySkuUseCase: GetStockBySkuExecutor) {}

  getStockBySku = async (req: Request, res: Response) => {
    const { sku } = req.params;

    try {
      const stock = await this.getStockBySkuUseCase.execute(sku);
      return res.status(200).json(stock);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      logger.error(
        {
          err: message,
          endpoint: '/v1/stock/:sku',
          method: req.method,
          url: req.originalUrl,
          requestId: req.headers['x-request-id'],
          sku,
          fscErrorCode:
            err instanceof SellerCenterGetStockError ? err.errorCode : undefined
        },
        '❌ Error in StockController.getStockBySku'
      );

      if (message === 'Invalid sku') {
        return res.status(400).json({ error: 'sku inválido' });
      }

      if (
        err instanceof SellerCenterGetStockError &&
        err.errorCode === '1001' &&
        String(err.errorMessage ?? '').toLowerCase().includes('invalid seller sku list')
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
        err instanceof SellerCenterGetStockError ||
        message.startsWith('SellerCenter GetStock HTTP')
      ) {
        return res.status(502).json({
          error: 'Error consultando Falabella Seller Center GetStock'
        });
      }

      return res.status(500).json({
        error: 'Error interno consultando stock por sku'
      });
    }
  };
}

export type { GetStockBySkuExecutor };
