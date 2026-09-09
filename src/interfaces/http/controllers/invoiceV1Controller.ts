import { Request, Response } from 'express';
import { logger } from '../../../infrastructure/logger/logger';
import { SellerCenterInvoicePDFError, SellerCenterInvoicePDFTransientError } from '../../../infrastructure/sellercenter/invoicePdfRepositorySellerCenter';
import { IdempotencyKeyConflictError, IdempotencyOperationInProgressError } from '../../../application/services/invoicePDFIdempotency';

interface UploadInvoicePDFExecutor {
  execute(input: {
    orderItemIds: string[];
    invoiceNumber: string;
    invoiceDate: string;
    invoiceType: 'BOLETA' | 'FACTURA';
    operatorCode: string;
    invoiceDocumentFormat: 'pdf';
    invoiceDocument: string;
  }, options?: { idempotencyKey?: string; signal?: AbortSignal }): Promise<unknown>;
}

export class InvoiceV1Controller {
  constructor(private readonly uploadUseCase: UploadInvoicePDFExecutor) {}

  uploadInvoicePDF = async (req: Request, res: Response) => {
    const requestAbort = new AbortController();
    const abort = () => requestAbort.abort();
    req.once?.('aborted', abort);
    res.once?.('close', abort);
    try {
      const idempotencyKeyHeader = req.headers['idempotency-key'];
      if (Array.isArray(idempotencyKeyHeader)) {
        throw new Error('Invalid Idempotency-Key');
      }
      const result = await this.uploadUseCase.execute(req.body, {
        idempotencyKey: idempotencyKeyHeader,
        signal: requestAbort.signal,
      });
      return res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      logger.error(
        {
          err: message,
          endpoint: '/v1/invoices/pdf',
          method: req.method,
          url: req.originalUrl,
          requestId: req.headers['x-request-id'],
        },
        '❌ Error in InvoiceV1Controller.uploadInvoicePDF'
      );

      if (message.startsWith('Invalid ')) {
        return res.status(400).json({
          ok: false,
          action: 'SetInvoicePDF',
          code: 'VALIDATION_ERROR',
          message,
          requestId: null,
        });
      }

      if (err instanceof IdempotencyKeyConflictError) {
        return res.status(409).json({
          ok: false,
          action: 'SetInvoicePDF',
          code: 'IDEMPOTENCY_KEY_CONFLICT',
          message: err.message,
          requestId: null,
        });
      }

      if (err instanceof IdempotencyOperationInProgressError) {
        res.setHeader('Retry-After', '1');
        return res.status(503).json({
          ok: false,
          action: 'SetInvoicePDF',
          code: 'IDEMPOTENCY_OPERATION_IN_PROGRESS',
          message: err.message,
          requestId: null,
        });
      }

      if (err instanceof SellerCenterInvoicePDFTransientError) {
        return res.status(err.code === 'UPSTREAM_TIMEOUT' ? 504 : 503).json({
          ok: false,
          action: 'SetInvoicePDF',
          code: err.code,
          message: err.message,
          requestId: null,
        });
      }

      if (err instanceof SellerCenterInvoicePDFError) {
        return res.status(400).json({
          ok: false,
          action: 'SetInvoicePDF',
          code: err.code,
          message: err.message,
          requestId: err.requestId,
          upstreamStatus: err.upstreamStatus,
        });
      }

      if (message.startsWith('SellerCenter SetInvoicePDF HTTP')) {
        return res.status(502).json({
          ok: false,
          action: 'SetInvoicePDF',
          code: null,
          message: 'Error consultando Falabella Seller Center SetInvoicePDF',
          requestId: null,
        });
      }

      return res.status(500).json({
        ok: false,
        action: 'SetInvoicePDF',
        code: null,
        message: 'Error interno al subir invoice PDF',
        requestId: null,
      });
    } finally {
      req.off?.('aborted', abort);
      res.off?.('close', abort);
    }
  };
}
