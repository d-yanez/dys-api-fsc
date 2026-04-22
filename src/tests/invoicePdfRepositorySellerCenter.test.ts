import test from 'node:test';
import assert from 'node:assert/strict';
import { InvoicePDFRepositorySellerCenter, SellerCenterInvoicePDFError } from '../infrastructure/sellercenter/invoicePdfRepositorySellerCenter';
import * as sellerCenterClient from '../infrastructure/sellercenter/sellerCenterClient';

const originalHttpPost = sellerCenterClient.httpPost;

test.afterEach(() => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = originalHttpPost;
});

const validInput = {
  orderItemIds: ['164027299'],
  invoiceNumber: '8481',
  invoiceDate: '2026-04-21',
  invoiceType: 'BOLETA' as const,
  operatorCode: 'FACL',
  invoiceDocumentFormat: 'pdf' as const,
  invoiceDocument: 'JVBERi0xLjQ=',
};

test('InvoicePDFRepositorySellerCenter maps SuccessResponse JSON', async () => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 200,
    body: JSON.stringify({
      SuccessResponse: {
        Head: {
          RequestId: '123456789',
          RequestAction: 'SetInvoicePDF',
          ResponseType: 'Success',
        },
        Body: {},
      },
    }),
  });

  const repo = new InvoicePDFRepositorySellerCenter();
  const result = await repo.uploadPDF(validInput);

  assert.equal(result.ok, true);
  assert.equal(result.alreadyExists, false);
  assert.equal(result.requestId, '123456789');
});

test('InvoicePDFRepositorySellerCenter maps E004 as alreadyExists success', async () => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 200,
    body: JSON.stringify({
      ErrorResponse: {
        Head: {
          RequestId: '123456789',
          RequestAction: 'SetInvoicePDF',
          ResponseType: 'Error',
        },
        Body: {
          Errors: [
            { Code: 'E004', Message: 'Invoice already exists' },
          ],
        },
      },
    }),
  });

  const repo = new InvoicePDFRepositorySellerCenter();
  const result = await repo.uploadPDF(validInput);

  assert.equal(result.ok, true);
  assert.equal(result.alreadyExists, true);
  assert.equal(result.message, 'Invoice already exists');
});

test('InvoicePDFRepositorySellerCenter throws typed error on non-E004 error', async () => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 200,
    body: JSON.stringify({
      ErrorResponse: {
        Head: {
          RequestId: '123',
          RequestAction: 'SetInvoicePDF',
          ResponseType: 'Error',
        },
        Body: {
          Errors: [{ Code: 'E999', Message: 'Bad invoice payload' }],
        },
      },
    }),
  });

  const repo = new InvoicePDFRepositorySellerCenter();

  await assert.rejects(
    async () => repo.uploadPDF(validInput),
    (err: unknown) => {
      assert.ok(err instanceof SellerCenterInvoicePDFError);
      assert.equal(err.code, 'E999');
      return true;
    }
  );
});
