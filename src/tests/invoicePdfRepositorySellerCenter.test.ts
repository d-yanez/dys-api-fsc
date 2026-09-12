import test from 'node:test';
import assert from 'node:assert/strict';
import {
  InvoicePDFRepositorySellerCenter,
  SellerCenterInvoicePDFError,
  SellerCenterInvoicePDFTransientError,
  SET_INVOICE_PDF_TIMEOUT_MS,
} from '../infrastructure/sellercenter/invoicePdfRepositorySellerCenter';
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

test('InvoicePDFRepositorySellerCenter preserves safe fields from a structured 404 ErrorResponse', async () => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 404,
    body: JSON.stringify({
      ErrorResponse: {
        Head: { RequestId: 'request-404' },
        Body: { Errors: [{ Code: 'E404', Message: 'Invoice order was not found' }] },
      },
    }),
  });

  await assert.rejects(
    () => new InvoicePDFRepositorySellerCenter().uploadPDF(validInput),
    (error: unknown) => {
      assert.ok(error instanceof SellerCenterInvoicePDFError);
      assert.equal(error.code, 'E404');
      assert.equal(error.message, 'Invoice order was not found');
      assert.equal(error.requestId, 'request-404');
      assert.equal(error.upstreamStatus, 404);
      assert.equal(error.failureKind, 'permanent');
      return true;
    }
  );
});

test('InvoicePDFRepositorySellerCenter uses a safe fallback for invalid and oversized error bodies', async () => {
  const bodies = [
    '{"ErrorResponse":{"Body":{"Errors":[{"Message":"JVBERi0xLjQ=',
    JSON.stringify({
      ErrorResponse: {
        Body: {
          Errors: [{ Message: validInput.invoiceDocument.repeat(20_000) }],
        },
      },
    }),
  ];

  for (const body of bodies) {
    (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
      status: 400,
      body,
    });

    await assert.rejects(
      () => new InvoicePDFRepositorySellerCenter().uploadPDF(validInput),
      (error: unknown) => {
        assert.ok(error instanceof SellerCenterInvoicePDFError);
        assert.equal(error.message, 'Seller Center SetInvoicePDF returned HTTP 400');
        assert.equal(error.message.includes(validInput.invoiceDocument), false);
        assert.equal(error.code, null);
        assert.equal(error.requestId, null);
        assert.equal(error.upstreamStatus, 400);
        return true;
      }
    );
  }
});

test('InvoicePDFRepositorySellerCenter classifies upstream 5xx as a gateway failure', async () => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 503,
    body: JSON.stringify({
      ErrorResponse: {
        Head: { RequestId: 'request-503' },
        Body: { Errors: [{ Code: 'E503', Message: 'Seller Center unavailable' }] },
      },
    }),
  });

  await assert.rejects(
    () => new InvoicePDFRepositorySellerCenter().uploadPDF(validInput),
    (error: unknown) => {
      assert.ok(error instanceof SellerCenterInvoicePDFError);
      assert.equal(error.failureKind, 'gateway');
      assert.equal(error.upstreamStatus, 503);
      assert.equal(error.code, 'E503');
      assert.equal(error.requestId, 'request-503');
      return true;
    }
  );
});

test('InvoicePDFRepositorySellerCenter classifies an invalid 2xx protocol body as a gateway failure without leaking it', async () => {
  const rawBody = `not-json-${validInput.invoiceDocument}`;
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 200,
    body: rawBody,
  });

  await assert.rejects(
    () => new InvoicePDFRepositorySellerCenter().uploadPDF(validInput),
    (error: unknown) => {
      assert.ok(error instanceof SellerCenterInvoicePDFError);
      assert.equal(error.failureKind, 'gateway');
      assert.equal(error.upstreamStatus, 200);
      assert.equal(error.message, 'Failed to parse SetInvoicePDF response');
      assert.equal(error.message.includes(rawBody), false);
      return true;
    }
  );
});

test('InvoicePDFRepositorySellerCenter redacts payload-like content from an upstream message', async () => {
  const leakedDocument = 'A'.repeat(80);
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 422,
    body: JSON.stringify({
      ErrorResponse: {
        Body: { Errors: [{ Code: 'E422', Message: `Rejected invoiceDocument ${leakedDocument}` }] },
      },
    }),
  });

  await assert.rejects(
    () => new InvoicePDFRepositorySellerCenter().uploadPDF(validInput),
    (error: unknown) => {
      assert.ok(error instanceof SellerCenterInvoicePDFError);
      assert.equal(error.message, 'Rejected invoiceDocument [redacted]');
      assert.equal(error.message.includes(leakedDocument), false);
      return true;
    }
  );
});

test('InvoicePDFRepositorySellerCenter applies the bounded SetInvoicePDF timeout', async () => {
  let receivedOptions: { signal?: AbortSignal; timeoutMs?: number } | undefined;
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async (_url, _body, _headers, options) => {
    receivedOptions = options;
    const error = new Error('timed out');
    error.name = 'SellerCenterRequestTimeoutError';
    throw error;
  };

  const repo = new InvoicePDFRepositorySellerCenter();
  await assert.rejects(
    () => repo.uploadPDF(validInput),
    (error: unknown) => error instanceof SellerCenterInvoicePDFTransientError && error.code === 'UPSTREAM_TIMEOUT'
  );
  assert.equal(receivedOptions?.timeoutMs, SET_INVOICE_PDF_TIMEOUT_MS);
});

test('InvoicePDFRepositorySellerCenter forwards request cancellation without exposing the payload', async () => {
  const abort = new AbortController();
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async (_url, _body, _headers, options) => {
    assert.equal(options?.signal, abort.signal);
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  const repo = new InvoicePDFRepositorySellerCenter();
  await assert.rejects(
    () => repo.uploadPDF(validInput, { signal: abort.signal }),
    (error: unknown) => error instanceof SellerCenterInvoicePDFTransientError && error.code === 'REQUEST_ABORTED'
  );
});
