import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeE004OrderItems,
  describeInvoicePDFRequest,
  GET_ORDER_ITEMS_DIAGNOSTIC_TIMEOUT_MS,
  IntervalSuccessTelemetrySampler,
  InvoicePDFRepositorySellerCenter,
  SellerCenterInvoicePDFError,
  SellerCenterInvoicePDFTransientError,
  SET_INVOICE_PDF_SUCCESS_SAMPLE_INTERVAL_MS,
  SET_INVOICE_PDF_TIMEOUT_MS,
} from '../infrastructure/sellercenter/invoicePdfRepositorySellerCenter';
import * as sellerCenterClient from '../infrastructure/sellercenter/sellerCenterClient';
import { logger } from '../infrastructure/logger/logger';
import { InvoicePDFUploadInput } from '../domain/invoice/invoicePdfRepository';

const originalHttpPost = sellerCenterClient.httpPost;
const originalLoggerInfo = logger.info;
const fixedChileNow = new Date('2026-09-12T15:00:00.000Z');

test.afterEach(() => {
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = originalHttpPost;
  logger.info = originalLoggerInfo;
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

test('describeInvoicePDFRequest emits only fixed fields, finite labels, and size buckets', () => {
  const sensitiveValues = [
    'order-item-sensitive-42',
    'invoice-number-sensitive-42',
    '2026-09-12-sensitive',
    'operator-sensitive-42',
    'pdf-base64-sensitive-42',
    'authorization-sensitive-42',
    'https://private.example/sensitive',
    'arbitrary-sensitive-42',
  ];
  const input = {
    ...validInput,
    orderItemIds: [sensitiveValues[0]],
    invoiceNumber: sensitiveValues[1],
    invoiceDate: sensitiveValues[2],
    operatorCode: sensitiveValues[3],
    invoiceDocument: sensitiveValues[4],
    authorization: sensitiveValues[5],
    endpoint: sensitiveValues[6],
    arbitraryField: sensitiveValues[7],
  } as typeof validInput;

  const shape = describeInvoicePDFRequest(input, fixedChileNow);

  assert.deepEqual(Object.keys(shape), [
    'orderItemIds',
    'invoiceNumber',
    'invoiceDate',
    'invoiceType',
    'operatorCode',
    'invoiceDocumentFormat',
    'invoiceDocument',
    'semanticChecks',
  ]);
  assert.deepEqual(shape, {
    orderItemIds: { type: 'array', countBucket: '1', itemType: 'all-strings' },
    invoiceNumber: { type: 'string', sizeBucket: '17-64' },
    invoiceDate: { type: 'string', sizeBucket: '17-64' },
    invoiceType: { type: 'string', sizeBucket: '1-16' },
    operatorCode: { type: 'string', sizeBucket: '17-64' },
    invoiceDocumentFormat: { type: 'string', sizeBucket: '1-16' },
    invoiceDocument: { type: 'string', sizeBucket: '17-64' },
    semanticChecks: {
      itemIdsNumeric: false,
      itemIdsUnique: true,
      invoiceDateNotFuture: false,
      documentBase64Valid: false,
      documentHasPdfMagic: false,
    },
  });
  const serializedShape = JSON.stringify(shape);
  for (const sensitiveValue of sensitiveValues) {
    assert.equal(serializedShape.includes(sensitiveValue), false);
  }
});

test('describeInvoicePDFRequest reports numeric and unique item ID semantics without exposing IDs', () => {
  assert.deepEqual(describeInvoicePDFRequest(validInput, fixedChileNow).semanticChecks, {
    itemIdsNumeric: true,
    itemIdsUnique: true,
    invoiceDateNotFuture: true,
    documentBase64Valid: true,
    documentHasPdfMagic: true,
  });

  assert.deepEqual(
    describeInvoicePDFRequest({ ...validInput, orderItemIds: ['123', '123'] }, fixedChileNow).semanticChecks,
    {
      itemIdsNumeric: true,
      itemIdsUnique: false,
      invoiceDateNotFuture: true,
      documentBase64Valid: true,
      documentHasPdfMagic: true,
    }
  );
  assert.equal(
    describeInvoicePDFRequest({ ...validInput, orderItemIds: ['123', 'not-numeric'] }, fixedChileNow).semanticChecks.itemIdsNumeric,
    false
  );
});

test('describeInvoicePDFRequest compares valid invoice calendar dates in America/Santiago', () => {
  const beforeUtcMidnightInSantiago = new Date('2026-09-13T02:30:00.000Z');

  assert.equal(
    describeInvoicePDFRequest({ ...validInput, invoiceDate: '2026-09-12' }, beforeUtcMidnightInSantiago).semanticChecks.invoiceDateNotFuture,
    true
  );
  assert.equal(
    describeInvoicePDFRequest({ ...validInput, invoiceDate: '2026-09-13' }, beforeUtcMidnightInSantiago).semanticChecks.invoiceDateNotFuture,
    false
  );
  assert.equal(
    describeInvoicePDFRequest({ ...validInput, invoiceDate: '2026-02-30' }, fixedChileNow).semanticChecks.invoiceDateNotFuture,
    false
  );
});

test('describeInvoicePDFRequest distinguishes canonical Base64 and PDF magic without logging content', () => {
  const cases = [
    { document: 'JVBERi0xLjQ=', base64Valid: true, hasPdfMagic: true },
    { document: 'aGVsbG8=', base64Valid: true, hasPdfMagic: false },
    { document: '', base64Valid: false, hasPdfMagic: false },
    { document: 'Zh==', base64Valid: false, hasPdfMagic: false },
    { document: 'aGVsbG8_', base64Valid: false, hasPdfMagic: false },
    { document: 'JVBERi0xLjQ', base64Valid: false, hasPdfMagic: false },
  ];

  for (const entry of cases) {
    const shape = describeInvoicePDFRequest({ ...validInput, invoiceDocument: entry.document }, fixedChileNow);
    assert.equal(shape.semanticChecks.documentBase64Valid, entry.base64Valid);
    assert.equal(shape.semanticChecks.documentHasPdfMagic, entry.hasPdfMagic);
    if (entry.document) assert.equal(JSON.stringify(shape).includes(entry.document), false);
  }
});

test('InvoicePDFRepositorySellerCenter maps SuccessResponse JSON', async () => {
  let postedBody = '';
  let diagnosticCalls = 0;
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async (_url, body) => {
    postedBody = body ?? '';
    return {
      status: 200,
      body: JSON.stringify({
        SuccessResponse: {
          Head: { RequestId: '123456789', RequestAction: 'SetInvoicePDF', ResponseType: 'Success' },
          Body: {},
        },
      }),
    };
  };

  const repo = new InvoicePDFRepositorySellerCenter(undefined, undefined, {
    async getOrderItemsByOrderId() {
      diagnosticCalls += 1;
      return [];
    },
  });
  const result = await repo.uploadPDF({ ...validInput, sellerOrderId: '1164806328' });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyExists, false);
  assert.equal(result.requestId, '123456789');
  assert.equal(diagnosticCalls, 0);
  assert.equal('sellerOrderId' in JSON.parse(postedBody), false);
});

test('InvoicePDFRepositorySellerCenter samples successes independently per finite item-count bucket', async () => {
  const sensitiveInput: InvoicePDFUploadInput = {
    orderItemIds: ['991827364551'],
    invoiceNumber: '7726354918',
    invoiceDate: '2026-09-11',
    invoiceType: 'FACTURA' as const,
    operatorCode: 'operator-private-sentinel',
    invoiceDocumentFormat: 'pdf',
    invoiceDocument: Buffer.from('%PDF-private-document-sentinel', 'ascii').toString('base64'),
  };
  const loggedContexts: Record<string, unknown>[] = [];
  logger.info = ((context: Record<string, unknown>) => {
    loggedContexts.push(context);
  }) as typeof logger.info;
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 200,
    body: JSON.stringify({
      SuccessResponse: {
        Head: { RequestId: 'sensitive-upstream-request-id', ResponseType: 'Success' },
        Body: {},
      },
    }),
  });

  let nowMs = fixedChileNow.getTime();
  const repo = new InvoicePDFRepositorySellerCenter(
    () => new Date(nowMs),
    new IntervalSuccessTelemetrySampler()
  );

  await repo.uploadPDF(sensitiveInput);
  nowMs += SET_INVOICE_PDF_SUCCESS_SAMPLE_INTERVAL_MS - 1;
  await repo.uploadPDF(sensitiveInput);
  await repo.uploadPDF({ ...sensitiveInput, orderItemIds: ['100', '200'] });
  nowMs += 1;
  await repo.uploadPDF(sensitiveInput);

  assert.equal(loggedContexts.length, 3);
  assert.deepEqual(
    loggedContexts.map((context) => (
      context.requestShape as { orderItemIds: { countBucket: string } }
    ).orderItemIds.countBucket),
    ['1', '2-5', '1']
  );
  for (const context of loggedContexts) {
    assert.deepEqual(Object.keys(context), ['event', 'outcome', 'requestShape']);
    assert.equal(context.event, 'set_invoice_pdf_request_shape_sample');
    assert.equal(context.outcome, 'success');
    const serializedContext = JSON.stringify(context);
    assert.equal(serializedContext.includes('sensitive-upstream-request-id'), false);
    const sensitiveValues = [
      ...sensitiveInput.orderItemIds,
      sensitiveInput.invoiceNumber,
      sensitiveInput.invoiceDate,
      sensitiveInput.invoiceType,
      sensitiveInput.operatorCode,
      sensitiveInput.invoiceDocument,
    ];
    for (const sensitiveValue of sensitiveValues) {
      assert.equal(serializedContext.includes(String(sensitiveValue)), false);
    }
    assert.equal(serializedContext.includes('100'), false);
    assert.equal(serializedContext.includes('200'), false);
  }
});

test('InvoicePDFRepositorySellerCenter skips full request analysis for a rate-limited success', async () => {
  let successSamples = 0;
  logger.info = (() => {
    successSamples += 1;
  }) as typeof logger.info;
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 200,
    body: JSON.stringify({
      SuccessResponse: {
        Head: { RequestId: 'request-id', ResponseType: 'Success' },
        Body: {},
      },
    }),
  });

  const repo = new InvoicePDFRepositorySellerCenter(
    () => fixedChileNow,
    new IntervalSuccessTelemetrySampler()
  );
  await repo.uploadPDF(validInput);

  let documentReads = 0;
  const rateLimitedInput = { ...validInput } as InvoicePDFUploadInput;
  Object.defineProperty(rateLimitedInput, 'invoiceDocument', {
    enumerable: true,
    get() {
      documentReads += 1;
      if (documentReads > 1) throw new Error('unexpected full request analysis');
      return validInput.invoiceDocument;
    },
  });

  const result = await repo.uploadPDF(rateLimitedInput);

  assert.equal(result.ok, true);
  assert.equal(documentReads, 1);
  assert.equal(successSamples, 1);
});

test('InvoicePDFRepositorySellerCenter maps E004 as alreadyExists success', async () => {
  let successSamples = 0;
  let diagnosticCalls = 0;
  logger.info = (() => {
    successSamples += 1;
  }) as typeof logger.info;
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

  const repo = new InvoicePDFRepositorySellerCenter(undefined, undefined, {
    async getOrderItemsByOrderId() {
      diagnosticCalls += 1;
      return [];
    },
  });
  const result = await repo.uploadPDF({ ...validInput, sellerOrderId: '1164806328' });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyExists, true);
  assert.equal(result.message, 'Invoice already exists');
  assert.equal(successSamples, 0);
  assert.equal(diagnosticCalls, 0);
});

test('describeE004OrderItems emits deterministic finite diagnostics', () => {
  const baseItems = [
    {
      orderItemId: 'sensitive-item-1',
      orderId: 'sensitive-order',
      status: 'shipped',
      shippingType: 'Dropshipping',
      isProcessable: true,
      packageId: 'sensitive-package-1',
    },
    {
      orderItemId: 'sensitive-item-2',
      orderId: 'sensitive-order',
      status: 'delivered',
      shippingType: 'FBS',
      isProcessable: true,
      packageId: 'sensitive-package-1',
    },
  ];

  const cases = [
    {
      code: 'REQUESTED_ITEMS_MISSING',
      items: baseItems.slice(0, 1),
    },
    {
      code: 'ITEM_STATUS_INELIGIBLE',
      items: baseItems.map((item) => ({ ...item, status: 'pending' })),
    },
    {
      code: 'OWN_WAREHOUSE_ITEMS',
      items: baseItems.map((item) => ({ ...item, shippingType: 'Own Warehouse' })),
    },
    {
      code: 'ITEMS_NOT_PROCESSABLE',
      items: baseItems.map((item) => ({ ...item, isProcessable: false })),
    },
    {
      code: 'MULTIPLE_PACKAGES',
      items: baseItems.map((item, index) => ({ ...item, packageId: `sensitive-package-${index}` })),
    },
    {
      code: 'NO_MISMATCH_DETECTED',
      items: baseItems,
    },
  ] as const;

  for (const entry of cases) {
    const diagnostic = describeE004OrderItems(['sensitive-item-1', 'sensitive-item-2'], entry.items);
    assert.equal(diagnostic.code, entry.code);
    assert.equal(diagnostic.requestedItemCount, 2);
    const serialized = JSON.stringify(diagnostic);
    assert.equal(serialized.includes('sensitive-item'), false);
    assert.equal(serialized.includes('sensitive-order'), false);
    assert.equal(serialized.includes('sensitive-package'), false);
  }
});

test('describeE004OrderItems maps unrecognized provider labels to a finite unknown value', () => {
  const sensitiveProviderValue = 'customer-sensitive-provider-value';
  const diagnostic = describeE004OrderItems(['item-1'], [{
    orderItemId: 'item-1',
    orderId: 'order-1',
    status: sensitiveProviderValue,
    shippingType: sensitiveProviderValue,
  }]);

  assert.deepEqual(diagnostic.statuses, ['unknown']);
  assert.deepEqual(diagnostic.shippingTypes, ['unknown']);
  assert.equal(JSON.stringify(diagnostic).includes(sensitiveProviderValue), false);
});

test('InvoicePDFRepositorySellerCenter performs one bounded diagnostic lookup after HTTP E004', async () => {
  let diagnosticCalls = 0;
  let receivedOrderId: string | undefined;
  let receivedOptions: { signal?: AbortSignal; timeoutMs?: number } | undefined;
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 404,
    body: JSON.stringify({
      ErrorResponse: {
        Head: { RequestId: 'request-404' },
        Body: { Errors: [{ Code: 'E004', Message: 'Invalid Request Format' }] },
      },
    }),
  });
  const abort = new AbortController();
  const repo = new InvoicePDFRepositorySellerCenter(undefined, undefined, {
    async getOrderItemsByOrderId(orderId, options) {
      diagnosticCalls += 1;
      receivedOrderId = orderId;
      receivedOptions = options;
      return [{
        orderItemId: validInput.orderItemIds[0],
        orderId,
        status: 'shipped',
        shippingType: 'Dropshipping',
        isProcessable: true,
        packageId: 'package-private',
      }];
    },
  });

  await assert.rejects(
    () => repo.uploadPDF({ ...validInput, sellerOrderId: '1164806328' }, { signal: abort.signal }),
    (error: unknown) => {
      assert.ok(error instanceof SellerCenterInvoicePDFError);
      assert.equal(error.code, 'E004');
      assert.equal(error.message, 'Invalid Request Format');
      assert.deepEqual(error.diagnostic, {
        code: 'NO_MISMATCH_DETECTED',
        requestedItemCount: 1,
        matchedItemCount: 1,
        missingItemCount: 0,
        statuses: ['shipped'],
        shippingTypes: ['dropshipping'],
        processability: { processable: 1, notProcessable: 0, unknown: 0 },
        packageCount: 1,
      });
      const serialized = JSON.stringify(error.diagnostic);
      assert.equal(serialized.includes(validInput.orderItemIds[0]), false);
      assert.equal(serialized.includes('1164806328'), false);
      assert.equal(serialized.includes('package-private'), false);
      assert.equal(serialized.includes(validInput.invoiceDocument), false);
      return true;
    }
  );

  assert.equal(diagnosticCalls, 1);
  assert.equal(receivedOrderId, '1164806328');
  assert.equal(receivedOptions?.signal, abort.signal);
  assert.equal(receivedOptions?.timeoutMs, GET_ORDER_ITEMS_DIAGNOSTIC_TIMEOUT_MS);
});

test('InvoicePDFRepositorySellerCenter preserves E004 when diagnostics fail', async () => {
  let diagnosticCalls = 0;
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost = async () => ({
    status: 404,
    body: JSON.stringify({
      ErrorResponse: {
        Head: { RequestId: 'request-404' },
        Body: { Errors: [{ Code: 'E004', Message: 'Invalid Request Format' }] },
      },
    }),
  });
  const repo = new InvoicePDFRepositorySellerCenter(undefined, undefined, {
    async getOrderItemsByOrderId() {
      diagnosticCalls += 1;
      throw new Error('customer-private-upstream-body');
    },
  });

  await assert.rejects(
    () => repo.uploadPDF({ ...validInput, sellerOrderId: '1164806328' }),
    (error: unknown) => {
      assert.ok(error instanceof SellerCenterInvoicePDFError);
      assert.equal(error.code, 'E004');
      assert.equal(error.message, 'Invalid Request Format');
      assert.deepEqual(error.diagnostic, {
        code: 'DIAGNOSTIC_UNAVAILABLE',
        requestedItemCount: 1,
        matchedItemCount: null,
        missingItemCount: null,
        statuses: [],
        shippingTypes: [],
        processability: null,
        packageCount: null,
      });
      assert.equal(JSON.stringify(error).includes('customer-private-upstream-body'), false);
      return true;
    }
  );
  assert.equal(diagnosticCalls, 1);
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
        Body: { Errors: [{ Code: 'E004', Message: 'Invalid Request Format' }] },
      },
    }),
  });

  await assert.rejects(
    () => new InvoicePDFRepositorySellerCenter().uploadPDF(validInput),
    (error: unknown) => {
      assert.ok(error instanceof SellerCenterInvoicePDFError);
      assert.equal(error.code, 'E004');
      assert.equal(error.message, 'Invalid Request Format');
      assert.equal(error.requestId, 'request-404');
      assert.equal(error.upstreamStatus, 404);
      assert.equal(error.failureKind, 'permanent');
      assert.deepEqual(error.requestShape, {
        orderItemIds: { type: 'array', countBucket: '1', itemType: 'all-strings' },
        invoiceNumber: { type: 'string', sizeBucket: '1-16' },
        invoiceDate: { type: 'string', sizeBucket: '1-16' },
        invoiceType: { type: 'string', sizeBucket: '1-16' },
        operatorCode: { type: 'string', sizeBucket: '1-16' },
        invoiceDocumentFormat: { type: 'string', sizeBucket: '1-16' },
        invoiceDocument: { type: 'string', sizeBucket: '1-16' },
        semanticChecks: {
          itemIdsNumeric: true,
          itemIdsUnique: true,
          invoiceDateNotFuture: true,
          documentBase64Valid: true,
          documentHasPdfMagic: true,
        },
      });
      const serializedShape = JSON.stringify(error.requestShape);
      for (const sensitiveValue of Object.values(validInput).flat()) {
        assert.equal(serializedShape.includes(String(sensitiveValue)), false);
      }
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
