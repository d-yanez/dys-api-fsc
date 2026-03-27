import crypto from 'crypto';
import https from 'https';
import { env } from '../config/env';
import { logger } from '../logger/logger';

function timestampPlus0000(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}+0000`;
}

export interface BuildSignedUrlParams {
  [key: string]: string | number | boolean | undefined;
}

export function buildSignedUrl(params: BuildSignedUrlParams): { url: string } {
  const baseParams: Record<string, string> = {
    Format: env.scFormat,
    UserID: env.scUserId,
    Version: env.scVersion,
    Timestamp: timestampPlus0000()
  };

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      baseParams[k] = String(v);
    }
  }

  const sorted = Object.keys(baseParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(baseParams[k])}`)
    .join('&');

  const signature = crypto
    .createHmac('sha256', env.scApiKey)
    .update(sorted)
    .digest('hex');

  const unsignedUrl = `${env.scEndpoint}/?${sorted}`;
  const url = `${unsignedUrl}&Signature=${signature}`;

  if (process.env.DEBUG_SC_REQUESTS === 'true') {
    logger.info(
      {
        action: baseParams.Action,
        version: baseParams.Version,
        format: baseParams.Format,
        orderId: baseParams.OrderId,
        url: unsignedUrl
      },
      '🔎 Seller Center request (unsigned)'
    );
  }

  return { url };
}

function stripSignature(url: string): string {
  return url.replace(/([?&])Signature=[^&]+&?/, '$1').replace(/[?&]$/, '');
}

export async function httpGet(url: string): Promise<{ status: number; body: string }> {
  logger.debug({ url }, '🌐 Calling Seller Center GET');
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          'User-Agent': env.scUserAgent
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status !== 200 && process.env.DEBUG_SC_REQUESTS === 'true') {
            logger.warn(
              { status, bodySnippet: data.slice(0, 300), url: stripSignature(url) },
              '⚠️ Seller Center non-200 response'
            );
          }
          resolve({ status, body: data });
        });
      }
    );

    req.on('error', (err) => {
      logger.error({ err }, '❌ Error in httpGet to Seller Center');
      reject(err);
    });
  });
}

export async function httpPost(
  url: string,
  body?: string,
  extraHeaders?: Record<string, string>
): Promise<{ status: number; body: string }> {
  logger.debug({ url }, '🌐 Calling Seller Center POST');
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const requestBody = body ?? '';
    const headers: Record<string, string> = {
      'User-Agent': env.scUserAgent
    };

    if (requestBody.length > 0) {
      headers['Content-Type'] = 'application/xml';
      headers['Accept'] = 'application/xml';
      headers['Content-Length'] = String(Buffer.byteLength(requestBody));
    }

    if (extraHeaders) {
      for (const [key, value] of Object.entries(extraHeaders)) {
        headers[key] = value;
      }
    }

    const req = https.request(
      {
        method: 'POST',
        protocol: u.protocol,
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status !== 200 && process.env.DEBUG_SC_REQUESTS === 'true') {
            logger.warn(
              { status, bodySnippet: data.slice(0, 300), url: stripSignature(url) },
              '⚠️ Seller Center non-200 response'
            );
          }
          resolve({ status, body: data });
        });
      }
    );

    req.on('error', (err) => {
      logger.error({ err }, '❌ Error in httpPost to Seller Center');
      reject(err);
    });

    if (requestBody.length > 0) {
      req.write(requestBody);
    }
    req.end();
  });
}
