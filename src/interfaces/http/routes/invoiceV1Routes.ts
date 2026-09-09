import { Router } from 'express';
import { InvoicePDFRepositorySellerCenter } from '../../../infrastructure/sellercenter/invoicePdfRepositorySellerCenter';
import { UploadInvoicePDFUseCase } from '../../../application/use-cases/uploadInvoicePDFUseCase';
import { InvoiceV1Controller } from '../controllers/invoiceV1Controller';
import { logger } from '../../../infrastructure/logger/logger';
import { DurableInvoicePDFIdempotencyStore } from '../../../application/services/invoicePDFIdempotency';
import { FirestoreInvoicePDFIdempotencyPersistence } from '../../../infrastructure/firestore/invoicePDFIdempotencyPersistence';

export function createInvoiceV1Router(executor?: UploadInvoicePDFUseCase): Router {
  const router = Router();
  const useCase =
    executor ??
    new UploadInvoicePDFUseCase(new InvoicePDFRepositorySellerCenter(), new DurableInvoicePDFIdempotencyStore(new FirestoreInvoicePDFIdempotencyPersistence()), (event) => {
      logger.info(
        { idempotencyEvent: event.event, idempotencyKeyHash: event.keyHash },
        'SetInvoicePDF idempotency event'
      );
    });
  const controller = new InvoiceV1Controller(useCase);

  router.post('/pdf', controller.uploadInvoicePDF);
  return router;
}

const invoiceV1Router = createInvoiceV1Router();
export { invoiceV1Router };
