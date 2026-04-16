import { Request, Response } from 'express';
import { logger } from '../../../infrastructure/logger/logger';
import { SellerCenterReadyToShipError } from '../../../infrastructure/sellercenter/readyToShipRepositorySellerCenter';
import { ReadyToShipErrorResponseDto } from '../../../application/dtos/readyToShipDto';

interface SetStatusToReadyToShipExecutor {
  execute(input: { orderItemIds: Array<string | number>; packageId: string }): Promise<unknown>;
}

const action = 'SetStatusToReadyToShip';

export class ReadyToShipStatusController {
  constructor(private readonly setStatusToReadyToShipUseCase: SetStatusToReadyToShipExecutor) {}

  setStatusToReadyToShip = async (req: Request, res: Response) => {
    const orderItemIds = req.body?.orderItemIds;
    const packageId = req.body?.packageId;

    try {
      const result = await this.setStatusToReadyToShipUseCase.execute({
        orderItemIds,
        packageId
      });
      return res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      logger.error(
        {
          err: message,
          endpoint: '/v1/status/ready-to-ship',
          method: req.method,
          url: req.originalUrl,
          requestId: req.headers['x-request-id'],
          orderItemIds,
          packageId,
          fscErrorCode:
            err instanceof SellerCenterReadyToShipError ? err.errorCode : undefined
        },
        '❌ Error in ReadyToShipStatusController.setStatusToReadyToShip'
      );

      if (message === 'Invalid orderItemIds' || message === 'Invalid packageId') {
        const payload: ReadyToShipErrorResponseDto = {
          ok: false,
          action,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: message
        };
        return res.status(400).json(payload);
      }

      if (err instanceof SellerCenterReadyToShipError) {
        const payload: ReadyToShipErrorResponseDto = {
          ok: false,
          action,
          errorCode: err.errorCode ?? null,
          errorMessage: err.errorMessage ?? err.message
        };
        return res.status(400).json(payload);
      }

      if (message.startsWith('SellerCenter SetStatusToReadyToShip HTTP')) {
        const payload: ReadyToShipErrorResponseDto = {
          ok: false,
          action,
          errorCode: null,
          errorMessage: 'Error consultando Falabella Seller Center SetStatusToReadyToShip'
        };
        return res.status(502).json(payload);
      }

      const payload: ReadyToShipErrorResponseDto = {
        ok: false,
        action,
        errorCode: null,
        errorMessage: 'Error interno al marcar orden como ready-to-ship'
      };
      return res.status(500).json(payload);
    }
  };
}

export type { SetStatusToReadyToShipExecutor };
