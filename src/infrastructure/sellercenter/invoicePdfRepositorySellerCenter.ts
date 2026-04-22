import crypto from 'crypto';
import { logger } from '../logger/logger';
import { env } from '../config/env';
import { httpPost } from './sellerCenterClient';
import { InvoicePDFRepository, InvoicePDFUploadInput, InvoicePDFUploadResult } from '../../domain/invoice/invoicePdfRepository';

export class SellerCenterInvoicePDFError extends Error {
  constructor(
    message: string,
    public readonly code: string | null = null,
    public readonly requestId: string | null = null,
    public readonly upstreamStatus: number | null = null,
  ) {
    super(message);
    this.name = 'SellerCenterInvoicePDFError';
  }
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

function extractJsonError(parsed: any): { code: string | null; message: string; requestId: string | null } {
  const requestId = parsed?.ErrorResponse?.Head?.RequestId != null
    ? String(parsed.ErrorResponse.Head.RequestId)
    : null;

  const firstError = parsed?.ErrorResponse?.Body?.Errors?.[0]
    ?? parsed?.ErrorResponse?.Body?.Errors?.Error?.[0]
    ?? parsed?.ErrorResponse?.Body?.Errors?.Error
    ?? null;

  const code = firstError?.Code != null ? String(firstError.Code) : null;
  const message = firstError?.Message != null
    ? String(firstError.Message)
    : 'Seller Center SetInvoicePDF returned ErrorResponse';

  return { code, message, requestId };
}

export class InvoicePDFRepositorySellerCenter implements InvoicePDFRepository {
  async uploadPDF(input: InvoicePDFUploadInput): Promise<InvoicePDFUploadResult> {
    const { headersToSign, signature } = buildSignatureHeaders();

    const endpoint = `${env.scEndpoint}/v1/marketplace-sellers/invoice/pdf`;
    const body = JSON.stringify(input);

    const { status, body: responseBody } = await httpPost(endpoint, body, {
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
    });

    if (status < 200 || status >= 300) {
      throw new SellerCenterInvoicePDFError(
        `SellerCenter SetInvoicePDF HTTP ${status}`,
        null,
        null,
        status,
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(responseBody);
    } catch (err) {
      logger.error({ err, bodySnippet: responseBody.slice(0, 500) }, '❌ Failed to parse SetInvoicePDF JSON response');
      throw new SellerCenterInvoicePDFError('Failed to parse SetInvoicePDF response', null, null, status);
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
      if (error.code === 'E004') {
        return {
          ok: true,
          action: 'SetInvoicePDF',
          requestId: error.requestId,
          alreadyExists: true,
          message: error.message || 'Invoice already exists',
        };
      }

      throw new SellerCenterInvoicePDFError(error.message, error.code, error.requestId, status);
    }

    throw new SellerCenterInvoicePDFError('Unexpected SetInvoicePDF response shape', null, null, status);
  }
}
