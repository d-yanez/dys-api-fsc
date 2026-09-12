import crypto from 'crypto';
import { logger } from '../logger/logger';
import { env } from '../config/env';
import { httpPost } from './sellerCenterClient';
import { InvoicePDFRepository, InvoicePDFUploadInput, InvoicePDFUploadResult } from '../../domain/invoice/invoicePdfRepository';

type RequestValueType = 'string' | 'array' | 'number' | 'boolean' | 'object' | 'null' | 'undefined';
type StringSizeBucket = 'empty' | '1-16' | '17-64' | '65-256' | '257-1024' | '1025-16384' | '16385+' | 'not-applicable';
type ArrayCountBucket = 'empty' | '1' | '2-5' | '6-20' | '21+' | 'not-applicable';
type ArrayItemType = 'empty' | 'all-strings' | 'mixed' | 'not-applicable';

interface ScalarRequestFieldShape {
  type: RequestValueType;
  sizeBucket: StringSizeBucket;
}

interface ArrayRequestFieldShape {
  type: RequestValueType;
  countBucket: ArrayCountBucket;
  itemType: ArrayItemType;
}

export interface SellerCenterInvoicePDFRequestShape {
  orderItemIds: ArrayRequestFieldShape;
  invoiceNumber: ScalarRequestFieldShape;
  invoiceDate: ScalarRequestFieldShape;
  invoiceType: ScalarRequestFieldShape;
  operatorCode: ScalarRequestFieldShape;
  invoiceDocumentFormat: ScalarRequestFieldShape;
  invoiceDocument: ScalarRequestFieldShape;
}

export class SellerCenterInvoicePDFError extends Error {
  constructor(
    message: string,
    public readonly code: string | null = null,
    public readonly requestId: string | null = null,
    public readonly upstreamStatus: number | null = null,
    public readonly failureKind: 'permanent' | 'gateway' = 'permanent',
    public readonly requestShape: SellerCenterInvoicePDFRequestShape | null = null,
  ) {
    super(message);
    this.name = 'SellerCenterInvoicePDFError';
  }
}

export class SellerCenterInvoicePDFTransientError extends Error {
  constructor(public readonly code: 'UPSTREAM_TIMEOUT' | 'REQUEST_ABORTED') {
    super(code === 'UPSTREAM_TIMEOUT' ? 'Seller Center SetInvoicePDF timed out' : 'Seller Center SetInvoicePDF request was aborted');
    this.name = 'SellerCenterInvoicePDFTransientError';
  }
}

export const SET_INVOICE_PDF_TIMEOUT_MS = 4_000;
const MAX_ERROR_RESPONSE_BYTES = 64 * 1024;
const MAX_ERROR_MESSAGE_LENGTH = 500;

function valueType(value: unknown): RequestValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'undefined') return 'undefined';
  return 'object';
}

function stringSizeBucket(value: unknown): StringSizeBucket {
  if (typeof value !== 'string') return 'not-applicable';
  if (value.length === 0) return 'empty';
  if (value.length <= 16) return '1-16';
  if (value.length <= 64) return '17-64';
  if (value.length <= 256) return '65-256';
  if (value.length <= 1_024) return '257-1024';
  if (value.length <= 16_384) return '1025-16384';
  return '16385+';
}

function scalarFieldShape(value: unknown): ScalarRequestFieldShape {
  return { type: valueType(value), sizeBucket: stringSizeBucket(value) };
}

function arrayCountBucket(value: unknown): ArrayCountBucket {
  if (!Array.isArray(value)) return 'not-applicable';
  if (value.length === 0) return 'empty';
  if (value.length === 1) return '1';
  if (value.length <= 5) return '2-5';
  if (value.length <= 20) return '6-20';
  return '21+';
}

function arrayItemType(value: unknown): ArrayItemType {
  if (!Array.isArray(value)) return 'not-applicable';
  if (value.length === 0) return 'empty';
  return value.every((item) => typeof item === 'string') ? 'all-strings' : 'mixed';
}

export function describeInvoicePDFRequest(input: InvoicePDFUploadInput): SellerCenterInvoicePDFRequestShape {
  return {
    orderItemIds: {
      type: valueType(input.orderItemIds),
      countBucket: arrayCountBucket(input.orderItemIds),
      itemType: arrayItemType(input.orderItemIds),
    },
    invoiceNumber: scalarFieldShape(input.invoiceNumber),
    invoiceDate: scalarFieldShape(input.invoiceDate),
    invoiceType: scalarFieldShape(input.invoiceType),
    operatorCode: scalarFieldShape(input.operatorCode),
    invoiceDocumentFormat: scalarFieldShape(input.invoiceDocumentFormat),
    invoiceDocument: scalarFieldShape(input.invoiceDocument),
  };
}

interface SafeSellerCenterError {
  code: string | null;
  message: string | null;
  requestId: string | null;
}

function buildSignatureHeaders() {
  const headersToSign = {
    Action: 'SetInvoicePDF',
    Format: 'JSON',
    Service: 'Invoice',
    Timestamp: new Date().toISOString(),
    UserID: env.scUserId,
    Version: '1.0',
  };

  const sortedKeys = Object.keys(headersToSign).sort();
  const stringToSign = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent((headersToSign as any)[k])}`)
    .join('&');

  const signature = crypto
    .createHmac('sha256', env.scApiKey)
    .update(stringToSign)
    .digest('hex');

  return {
    headersToSign,
    signature,
  };
}

function sanitizeIdentifier(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maxLength || !/^[A-Za-z0-9._:-]+$/.test(normalized)) return null;
  return normalized;
}

function sanitizeErrorMessage(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/"invoiceDocument"\s*:\s*"[^"]*"/gi, '"invoiceDocument":"[redacted]"')
    .replace(/(?:data:application\/pdf;base64,)?[A-Za-z0-9+/]{64,}={0,2}/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.length > MAX_ERROR_MESSAGE_LENGTH) return null;
  return normalized;
}

function extractJsonError(parsed: unknown): SafeSellerCenterError | null {
  const response = (parsed as {
    ErrorResponse?: {
      Head?: { RequestId?: unknown; ErrorCode?: unknown; ErrorMessage?: unknown };
      Body?: { Errors?: unknown };
    };
  })?.ErrorResponse;
  if (!response) return null;

  const requestId = sanitizeIdentifier(response.Head?.RequestId, 128);

  const errors = response.Body?.Errors;
  const firstError = Array.isArray(errors)
    ? errors[0]
    : (errors as { Error?: unknown } | null)?.Error;
  const normalizedError = Array.isArray(firstError) ? firstError[0] : firstError;
  const fields = normalizedError as { Code?: unknown; Message?: unknown } | null;

  const code = sanitizeIdentifier(fields?.Code ?? response.Head?.ErrorCode, 64);
  const message = sanitizeErrorMessage(fields?.Message ?? response.Head?.ErrorMessage);

  return { code, message, requestId };
}

function parseBoundedErrorResponse(responseBody: string): SafeSellerCenterError | null {
  if (Buffer.byteLength(responseBody, 'utf8') > MAX_ERROR_RESPONSE_BYTES) return null;
  try {
    return extractJsonError(JSON.parse(responseBody) as unknown);
  } catch {
    return null;
  }
}

export class InvoicePDFRepositorySellerCenter implements InvoicePDFRepository {
  async uploadPDF(input: InvoicePDFUploadInput, options?: { signal?: AbortSignal }): Promise<InvoicePDFUploadResult> {
    const { headersToSign, signature } = buildSignatureHeaders();
    const requestShape = () => describeInvoicePDFRequest(input);

    const endpoint = `${env.scEndpoint}/v1/marketplace-sellers/invoice/pdf`;
    const body = JSON.stringify(input);

    let response: Awaited<ReturnType<typeof httpPost>>;
    try {
      response = await httpPost(endpoint, body, {
        accept: 'application/json',
        'content-type': 'application/json',
        Action: headersToSign.Action,
        Format: headersToSign.Format,
        Service: headersToSign.Service,
        Timestamp: headersToSign.Timestamp,
        UserID: headersToSign.UserID,
        Version: headersToSign.Version,
        Signature: signature,
        'User-Agent': env.scUserAgent || 'PostmanRuntime',
      }, { signal: options?.signal, timeoutMs: SET_INVOICE_PDF_TIMEOUT_MS });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new SellerCenterInvoicePDFTransientError('REQUEST_ABORTED');
      if (error instanceof Error && error.name === 'SellerCenterRequestTimeoutError') throw new SellerCenterInvoicePDFTransientError('UPSTREAM_TIMEOUT');
      throw error;
    }
    const { status, body: responseBody } = response;

    if (status < 200 || status >= 300) {
      const error = parseBoundedErrorResponse(responseBody);
      throw new SellerCenterInvoicePDFError(
        error?.message ?? `Seller Center SetInvoicePDF returned HTTP ${status}`,
        error?.code ?? null,
        error?.requestId ?? null,
        status,
        status >= 500 ? 'gateway' : 'permanent',
        requestShape(),
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      logger.error(
        { upstreamStatus: status, responseBytes: Buffer.byteLength(responseBody, 'utf8') },
        '❌ Failed to parse SetInvoicePDF JSON response'
      );
      throw new SellerCenterInvoicePDFError('Failed to parse SetInvoicePDF response', null, null, status, 'gateway', requestShape());
    }

    if (parsed?.SuccessResponse?.Head?.ResponseType === 'Success' || parsed?.SuccessResponse) {
      const requestId = parsed?.SuccessResponse?.Head?.RequestId != null
        ? String(parsed.SuccessResponse.Head.RequestId)
        : null;
      return {
        ok: true,
        action: 'SetInvoicePDF',
        requestId,
        alreadyExists: false,
        message: 'Invoice PDF uploaded',
      };
    }

    if (parsed?.ErrorResponse) {
      const error = extractJsonError(parsed);
      if (error?.code === 'E004') {
        return {
          ok: true,
          action: 'SetInvoicePDF',
          requestId: error.requestId,
          alreadyExists: true,
          message: error.message ?? 'Invoice already exists',
        };
      }

      throw new SellerCenterInvoicePDFError(
        error?.message ?? 'Seller Center SetInvoicePDF returned ErrorResponse',
        error?.code ?? null,
        error?.requestId ?? null,
        status,
        'permanent',
        requestShape(),
      );
    }

    throw new SellerCenterInvoicePDFError('Unexpected SetInvoicePDF response shape', null, null, status, 'gateway', requestShape());
  }
}
