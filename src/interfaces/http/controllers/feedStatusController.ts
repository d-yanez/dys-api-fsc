import { Request, Response } from 'express';
import { logger } from '../../../infrastructure/logger/logger';
import { SellerCenterFeedStatusError } from '../../../infrastructure/sellercenter/stockRepositorySellerCenter';

interface GetFeedStatusExecutor {
  execute(feedId: string): Promise<unknown>;
}

export class FeedStatusController {
  constructor(private readonly getFeedStatusUseCase: GetFeedStatusExecutor) {}

  getFeedStatus = async (req: Request, res: Response) => {
    const { feedId } = req.params;

    try {
      const result = await this.getFeedStatusUseCase.execute(feedId);
      return res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      logger.error(
        {
          err: message,
          endpoint: '/v1/feed/status/:feedId',
          method: req.method,
          url: req.originalUrl,
          requestId: req.headers['x-request-id'],
          feedId,
          fscErrorCode:
            err instanceof SellerCenterFeedStatusError ? err.errorCode : undefined
        },
        '❌ Error in FeedStatusController.getFeedStatus'
      );

      if (message === 'Invalid feedId') {
        return res.status(400).json({ error: 'feedId inválido' });
      }

      if (
        err instanceof SellerCenterFeedStatusError &&
        String(err.errorMessage ?? '').toLowerCase().includes('feed') &&
        String(err.errorMessage ?? '').toLowerCase().includes('not found')
      ) {
        return res.status(404).json({
          error: 'Feed no encontrado en Falabella Seller Center',
          details: {
            code: err.errorCode ?? null,
            message: err.errorMessage ?? err.message
          }
        });
      }

      if (
        err instanceof SellerCenterFeedStatusError ||
        message.startsWith('SellerCenter FeedStatus HTTP')
      ) {
        return res.status(502).json({
          error: 'Error consultando Falabella Seller Center FeedStatus'
        });
      }

      return res.status(500).json({
        error: 'Error interno consultando estado de feed'
      });
    }
  };
}

export type { GetFeedStatusExecutor };
