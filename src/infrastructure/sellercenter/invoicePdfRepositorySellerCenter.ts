import crypto from 'crypto';
import { logger } from '../logger/logger';
import { env } from '../config/env';
import { httpPost } from './sellerCenterClient';
import {
  InvoicePDFE004Diagnostic,
  InvoicePDFE004DiagnosticCode,
  InvoicePDFRepository,
  InvoicePDFUploadInput,
  InvoicePDFUploadResult,
} from '../../domain/invoice/invoicePdfRepository';
import { OrderItemRepository } from '../../domain/orders/orderItemRepository';
import { OrderItem } from '../../domain/orders/orderItem';

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
  semanticChecks: {
    itemIdsNumeric: boolean;
    itemIdsUnique: boolean;
    invoiceDateNotFuture: boolean;
    documentBase64Valid: boolean;
    documentHasPdfMagic: boolean;
  };
}

export class SellerCenterInvoicePDFError extends Error {
  constructor(
    message: string,
    public readonly code: string | null = null,
    public readonly requestId: string | null = null,
    public readonly upstreamStatus: number | null = null,
    public readonly failureKind: 'permanent' | 'gateway' = 'permanent',
    public readonly requestShape: SellerCenterInvoicePDFRequestShape | null = null,
    public readonly diagnostic: InvoicePDFE004Diagnostic | null = null,
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
export const GET_ORDER_ITEMS_DIAGNOSTIC_TIMEOUT_MS = 1_500;
export const SET_INVOICE_PDF_SUCCESS_SAMPLE_INTERVAL_MS = 15 * 60 * 1_000;
const MAX_ERROR_RESPONSE_BYTES = 64 * 1024;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const CHILE_TIME_ZONE = 'America/Santiago';
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CANONICAL_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
const chileDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CHILE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export class IntervalSuccessTelemetrySampler {
  private readonly lastSampleAtByItemCountBucket = new Map<ArrayCountBucket, number>();

  constructor(private readonly intervalMs = SET_INVOICE_PDF_SUCCESS_SAMPLE_INTERVAL_MS) {}

  shouldSample(itemCountBucket: ArrayCountBucket, nowMs: number): boolean {
    const lastSampleAt = this.lastSampleAtByItemCountBucket.get(itemCountBucket);
    if (lastSampleAt !== undefined && nowMs - lastSampleAt < this.intervalMs) return false;
    this.lastSampleAtByItemCountBucket.set(itemCountBucket, nowMs);
    return true;
  }
}

const processSuccessTelemetrySampler = new IntervalSuccessTelemetrySampler();

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

function currentChileDate(now: Date): string {
  const parts = chileDateFormatter.formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(0);
  candidate.setUTCHours(0, 0, 0, 0);
  candidate.setUTCFullYear(year, month - 1, day);
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

function isCanonicalStandardBase64(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return false;
  if (!CANONICAL_BASE64_PATTERN.test(value)) return false;

  const lastQuartet = value.slice(-4);
  if (lastQuartet.endsWith('==')) {
    return BASE64_ALPHABET.indexOf(lastQuartet[1]) % 16 === 0;
  }
  if (lastQuartet.endsWith('=')) {
    return BASE64_ALPHABET.indexOf(lastQuartet[2]) % 4 === 0;
  }
  return true;
}

function hasPdfMagic(value: string): boolean {
  if (value.length < 8) return false;
  const prefix = Buffer.from(value.slice(0, 8), 'base64');
  return prefix.length >= PDF_MAGIC.length && prefix.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC);
}

export function describeInvoicePDFRequest(input: InvoicePDFUploadInput, now = new Date()): SellerCenterInvoicePDFRequestShape {
  const itemIds = Array.isArray(input.orderItemIds) ? input.orderItemIds : [];
  const documentBase64Valid = isCanonicalStandardBase64(input.invoiceDocument);
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
    semanticChecks: {
      itemIdsNumeric: itemIds.length > 0 && itemIds.every((item) => typeof item === 'string' && /^\d+$/.test(item)),
      itemIdsUnique: itemIds.length > 0 && new Set(itemIds).size === itemIds.length,
      invoiceDateNotFuture: isValidCalendarDate(input.invoiceDate) && input.invoiceDate <= currentChileDate(now),
      documentBase64Valid,
      documentHasPdfMagic: documentBase64Valid && hasPdfMagic(input.invoiceDocument),
    },
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

const ELIGIBLE_INVOICE_STATUSES = new Set(['ready_to_ship', 'shipped', 'delivered']);
const FINITE_STATUSES = new Set([
  'pending',
  'ready_to_ship',
  'shipped',
  'delivered',
  'canceled',
  'cancelled',
  'returned',
  'failed',
]);
const FINITE_SHIPPING_TYPES = new Set([
  'dropshipping',
  'fulfillment',
  'own_warehouse',
  'cross_docking',
]);

function normalizedLabel(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function safeStatus(value: string | null | undefined): string {
  const normalized = normalizedLabel(value);
  return FINITE_STATUSES.has(normalized) ? normalized : 'unknown';
}

function safeShippingType(value: string | null | undefined): string {
  const normalized = normalizedLabel(value);
  if (normalized === 'fbs') return 'dropshipping';
  if (normalized === 'fbf' || normalized === 'ownwarehouse') return 'fulfillment';
  return FINITE_SHIPPING_TYPES.has(normalized) ? normalized : 'unknown';
}

function diagnosticCode(params: {
  missingItemCount: number;
  statuses: string[];
  shippingTypes: string[];
  notProcessable: number;
  packageCount: number;
}): InvoicePDFE004DiagnosticCode {
  if (params.missingItemCount > 0) return 'REQUESTED_ITEMS_MISSING';
  if (params.notProcessable > 0) return 'ITEMS_NOT_PROCESSABLE';
  if (params.shippingTypes.some((value) => value === 'fulfillment' || value === 'own_warehouse')) {
    return 'OWN_WAREHOUSE_ITEMS';
  }
  if (params.statuses.some((value) => !ELIGIBLE_INVOICE_STATUSES.has(value))) return 'ITEM_STATUS_INELIGIBLE';
  if (params.packageCount > 1) return 'MULTIPLE_PACKAGES';
  return 'NO_MISMATCH_DETECTED';
}

export function describeE004OrderItems(
  requestedOrderItemIds: string[],
  currentItems: OrderItem[]
): InvoicePDFE004Diagnostic {
  const currentById = new Map(currentItems.map((item) => [item.orderItemId, item]));
  const matchedItems = requestedOrderItemIds
    .map((orderItemId) => currentById.get(orderItemId))
    .filter((item): item is OrderItem => item !== undefined);
  const missingItemCount = requestedOrderItemIds.length - matchedItems.length;
  const statuses = [...new Set(matchedItems.map((item) => safeStatus(item.status)))].sort();
  const shippingTypes = [...new Set(matchedItems.map((item) => safeShippingType(item.shippingType)))].sort();
  const processability = {
    processable: matchedItems.filter((item) => item.isProcessable === true).length,
    notProcessable: matchedItems.filter((item) => item.isProcessable === false).length,
    unknown: matchedItems.filter((item) => item.isProcessable == null).length,
  };
  const packageCount = new Set(
    matchedItems.map((item) => item.packageId?.trim()).filter((value): value is string => Boolean(value))
  ).size;

  return {
    code: diagnosticCode({
      missingItemCount,
      statuses,
      shippingTypes,
      notProcessable: processability.notProcessable,
      packageCount,
    }),
    requestedItemCount: requestedOrderItemIds.length,
    matchedItemCount: matchedItems.length,
    missingItemCount,
    statuses,
    shippingTypes,
    processability,
    packageCount,
  };
}

function unavailableE004Diagnostic(requestedItemCount: number): InvoicePDFE004Diagnostic {
  return {
    code: 'DIAGNOSTIC_UNAVAILABLE',
    requestedItemCount,
    matchedItemCount: null,
    missingItemCount: null,
    statuses: [],
    shippingTypes: [],
    processability: null,
    packageCount: null,
  };
}

export class InvoicePDFRepositorySellerCenter implements InvoicePDFRepository {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly successTelemetrySampler: IntervalSuccessTelemetrySampler = processSuccessTelemetrySampler,
    private readonly orderItemRepository?: Pick<OrderItemRepository, 'getOrderItemsByOrderId'>,
  ) {}

  private async diagnoseE004(
    input: InvoicePDFUploadInput,
    signal?: AbortSignal
  ): Promise<InvoicePDFE004Diagnostic | null> {
    if (!input.sellerOrderId || !this.orderItemRepository) return null;
    try {
      const items = await this.orderItemRepository.getOrderItemsByOrderId(input.sellerOrderId, {
        signal,
        timeoutMs: GET_ORDER_ITEMS_DIAGNOSTIC_TIMEOUT_MS,
      });
      return describeE004OrderItems(input.orderItemIds, items);
    } catch {
      return unavailableE004Diagnostic(input.orderItemIds.length);
    }
  }

  async uploadPDF(input: InvoicePDFUploadInput, options?: { signal?: AbortSignal }): Promise<InvoicePDFUploadResult> {
    const { headersToSign, signature } = buildSignatureHeaders();
    const requestShape = () => describeInvoicePDFRequest(input, this.now());

    const endpoint = `${env.scEndpoint}/v1/marketplace-sellers/invoice/pdf`;
    const body = JSON.stringify({
      orderItemIds: input.orderItemIds,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      invoiceType: input.invoiceType,
      operatorCode: input.operatorCode,
      invoiceDocumentFormat: input.invoiceDocumentFormat,
      invoiceDocument: input.invoiceDocument,
    });

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
      const diagnostic = error?.code === 'E004'
        ? await this.diagnoseE004(input, options?.signal)
        : null;
      throw new SellerCenterInvoicePDFError(
        error?.message ?? `Seller Center SetInvoicePDF returned HTTP ${status}`,
        error?.code ?? null,
        error?.requestId ?? null,
        status,
        status >= 500 ? 'gateway' : 'permanent',
        requestShape(),
        diagnostic,
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
      const now = this.now();
      const itemCountBucket = arrayCountBucket(input.orderItemIds);
      if (this.successTelemetrySampler.shouldSample(itemCountBucket, now.getTime())) {
        logger.info(
          {
            event: 'set_invoice_pdf_request_shape_sample',
            outcome: 'success',
            requestShape: describeInvoicePDFRequest(input, now),
          },
          'SetInvoicePDF successful request telemetry sample'
        );
      }
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
