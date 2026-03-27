import { XMLParser } from 'fast-xml-parser';
import { StockRepository } from '../../domain/stocks/stockRepository';
import { StockBySku, StockWarehouse } from '../../domain/stocks/stock';
import { StockUpdateRepository, UpdateStockResult } from '../../domain/stocks/stockUpdateRepository';
import { FeedStatusRepository, FeedStatusResult } from '../../domain/stocks/feedStatusRepository';
import { buildSignedUrl, httpGet, httpPost } from './sellerCenterClient';
import { logger } from '../logger/logger';
import { env } from '../config/env';

interface ParsedFscErrorResponse {
  requestAction?: string;
  errorType?: string;
  errorCode?: string;
  errorMessage?: string;
}

export class SellerCenterGetStockError extends Error {
  constructor(
    message: string,
    public readonly requestAction?: string,
    public readonly errorType?: string,
    public readonly errorCode?: string,
    public readonly errorMessage?: string
  ) {
    super(message);
    this.name = 'SellerCenterGetStockError';
  }
}

export class SellerCenterUpdateStockError extends Error {
  constructor(
    message: string,
    public readonly requestAction?: string,
    public readonly errorType?: string,
    public readonly errorCode?: string,
    public readonly errorMessage?: string
  ) {
    super(message);
    this.name = 'SellerCenterUpdateStockError';
  }
}

export class SellerCenterFeedStatusError extends Error {
  constructor(
    message: string,
    public readonly requestAction?: string,
    public readonly errorType?: string,
    public readonly errorCode?: string,
    public readonly errorMessage?: string
  ) {
    super(message);
    this.name = 'SellerCenterFeedStatusError';
  }
}

function toTrimmedStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

function toNumberOrZero(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(String(value).trim());
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

function parseErrorResponse(parsed: unknown): ParsedFscErrorResponse | null {
  const root = parsed as {
    ErrorResponse?: {
      Head?: {
        RequestAction?: unknown;
        ErrorType?: unknown;
        ErrorCode?: unknown;
        ErrorMessage?: unknown;
      };
    };
  };

  const head = root?.ErrorResponse?.Head;
  if (!head) {
    return null;
  }

  return {
    requestAction: toTrimmedStringOrNull(head.RequestAction) ?? undefined,
    errorType: toTrimmedStringOrNull(head.ErrorType) ?? undefined,
    errorCode: toTrimmedStringOrNull(head.ErrorCode) ?? undefined,
    errorMessage: toTrimmedStringOrNull(head.ErrorMessage) ?? undefined
  };
}

export class StockRepositorySellerCenter
  implements StockRepository, StockUpdateRepository, FeedStatusRepository
{
  private readonly xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      trimValues: true
    });
  }

  async getStockBySku(sku: string): Promise<StockBySku> {
    const { url } = buildSignedUrl({
      Action: 'GetStock',
      Version: '1.0',
      'SellerSku[0]': sku
    });

    const { status, body } = await httpGet(url);

    if (status !== 200) {
      logger.error(
        { status, bodySnippet: body.slice(0, 300), sku },
        '❌ Non-200 response from Seller Center GetStock'
      );
      throw new Error(`SellerCenter GetStock HTTP ${status}`);
    }

    let parsed: unknown;
    try {
      parsed = this.xmlParser.parse(body);
    } catch (err: unknown) {
      logger.error(
        {
          err: err instanceof Error ? err.message : err,
          sku,
          bodySnippet: body.slice(0, 500)
        },
        '❌ Failed to parse Seller Center GetStock XML response'
      );
      throw new Error('Failed to parse Seller Center GetStock response');
    }

    const parsedError = parseErrorResponse(parsed);
    if (parsedError) {
      logger.warn(
        {
          sku,
          requestAction: parsedError.requestAction,
          errorType: parsedError.errorType,
          errorCode: parsedError.errorCode,
          errorMessage: parsedError.errorMessage
        },
        '⚠️ Seller Center GetStock returned ErrorResponse'
      );

      throw new SellerCenterGetStockError(
        parsedError.errorMessage ?? 'Seller Center GetStock returned ErrorResponse',
        parsedError.requestAction,
        parsedError.errorType,
        parsedError.errorCode,
        parsedError.errorMessage
      );
    }

    const root = parsed as {
      SuccessResponse?: {
        Body?: {
          Stocks?: {
            SellerWarehouses?: {
              Warehouse?:
                | {
                    SellerWarehouseId?: unknown;
                    FacilityID?: unknown;
                    SellerSku?: unknown;
                    Quantity?: unknown;
                  }
                | Array<{
                    SellerWarehouseId?: unknown;
                    FacilityID?: unknown;
                    SellerSku?: unknown;
                    Quantity?: unknown;
                  }>;
            };
          };
        };
      };
    };

    const warehouseNode =
      root?.SuccessResponse?.Body?.Stocks?.SellerWarehouses?.Warehouse;

    if (!warehouseNode) {
      throw new Error('Stock not found in Seller Center GetStock response');
    }

    const warehousesArray = Array.isArray(warehouseNode)
      ? warehouseNode
      : [warehouseNode];

    const warehouses: StockWarehouse[] = warehousesArray.map((warehouse) => {
      const sellerSku = toTrimmedStringOrNull(warehouse.SellerSku) ?? sku;
      const quantity = toNumberOrZero(warehouse.Quantity);

      return {
        sellerWarehouseId: toTrimmedStringOrNull(warehouse.SellerWarehouseId),
        facilityId: toTrimmedStringOrNull(warehouse.FacilityID),
        sellerSku,
        quantity
      };
    });

    const totalQuantity = warehouses.reduce((acc, item) => acc + item.quantity, 0);

    return {
      sku,
      totalQuantity,
      warehouses
    };
  }

  async updateStock(input: { sellerSku: string; quantity: number }): Promise<UpdateStockResult> {
    const { sellerSku, quantity } = input;

    if (!env.scGscFacilityId) {
      throw new Error('Missing SC_GSC_FACILITY_ID');
    }

    const { url } = buildSignedUrl({
      Action: 'UpdateStock',
      Version: '1.0',
      Format: 'XML'
    });

    const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<Request>
  <Warehouse>
    <Stock>
      <GSCFacilityId>${env.scGscFacilityId}</GSCFacilityId>
      <SellerSku>${sellerSku}</SellerSku>
      <Quantity>${quantity}</Quantity>
    </Stock>
  </Warehouse>
</Request>`;

    const { status, body } = await httpPost(url, xmlBody, {
      'Content-Type': 'application/xml',
      'Accept': 'application/xml'
    });

    if (status !== 200) {
      logger.error(
        { status, bodySnippet: body.slice(0, 300), sellerSku, quantity },
        '❌ Non-200 response from Seller Center UpdateStock'
      );
      throw new Error(`SellerCenter UpdateStock HTTP ${status}`);
    }

    let parsed: unknown;
    try {
      parsed = this.xmlParser.parse(body);
    } catch (err: unknown) {
      logger.error(
        {
          err: err instanceof Error ? err.message : err,
          sellerSku,
          quantity,
          bodySnippet: body.slice(0, 500)
        },
        '❌ Failed to parse Seller Center UpdateStock XML response'
      );
      throw new Error('Failed to parse Seller Center UpdateStock response');
    }

    const parsedError = parseErrorResponse(parsed);
    if (parsedError) {
      logger.warn(
        {
          sellerSku,
          quantity,
          requestAction: parsedError.requestAction,
          errorType: parsedError.errorType,
          errorCode: parsedError.errorCode,
          errorMessage: parsedError.errorMessage
        },
        '⚠️ Seller Center UpdateStock returned ErrorResponse'
      );

      throw new SellerCenterUpdateStockError(
        parsedError.errorMessage ?? 'Seller Center UpdateStock returned ErrorResponse',
        parsedError.requestAction,
        parsedError.errorType,
        parsedError.errorCode,
        parsedError.errorMessage
      );
    }

    const root = parsed as {
      SuccessResponse?: {
        Head?: {
          RequestAction?: unknown;
        };
        Body?: {
          Stocks?: {
            feed?: unknown;
          };
        };
      };
    };

    const feedId = toTrimmedStringOrNull(root?.SuccessResponse?.Body?.Stocks?.feed);

    if (!feedId) {
      throw new Error('Feed not found in Seller Center UpdateStock response');
    }

    return {
      success: true,
      status: 'accepted',
      action: 'UpdateStock',
      sellerSku,
      quantity,
      facilityId: env.scGscFacilityId,
      feedId
    };
  }

  async getFeedStatus(feedId: string): Promise<FeedStatusResult> {
    const { url } = buildSignedUrl({
      Action: 'FeedStatus',
      Version: '1.0',
      Format: 'XML',
      FeedID: feedId
    });

    const { status, body } = await httpGet(url);

    if (status !== 200) {
      logger.error(
        { status, bodySnippet: body.slice(0, 300), feedId },
        '❌ Non-200 response from Seller Center FeedStatus'
      );
      throw new Error(`SellerCenter FeedStatus HTTP ${status}`);
    }

    let parsed: unknown;
    try {
      parsed = this.xmlParser.parse(body);
    } catch (err: unknown) {
      logger.error(
        {
          err: err instanceof Error ? err.message : err,
          feedId,
          bodySnippet: body.slice(0, 500)
        },
        '❌ Failed to parse Seller Center FeedStatus XML response'
      );
      throw new Error('Failed to parse Seller Center FeedStatus response');
    }

    const parsedError = parseErrorResponse(parsed);
    if (parsedError) {
      logger.warn(
        {
          feedId,
          requestAction: parsedError.requestAction,
          errorType: parsedError.errorType,
          errorCode: parsedError.errorCode,
          errorMessage: parsedError.errorMessage
        },
        '⚠️ Seller Center FeedStatus returned ErrorResponse'
      );

      throw new SellerCenterFeedStatusError(
        parsedError.errorMessage ?? 'Seller Center FeedStatus returned ErrorResponse',
        parsedError.requestAction,
        parsedError.errorType,
        parsedError.errorCode,
        parsedError.errorMessage
      );
    }

    const root = parsed as {
      SuccessResponse?: {
        Body?: {
          FeedDetail?: {
            Feed?: unknown;
            Status?: unknown;
            Action?: unknown;
            CreationDate?: unknown;
            UpdatedDate?: unknown;
            Source?: unknown;
            TotalRecords?: unknown;
            ProcessedRecords?: unknown;
            FailedRecords?: unknown;
          };
        };
      };
    };

    const detail = root?.SuccessResponse?.Body?.FeedDetail;

    if (!detail) {
      throw new Error('FeedDetail not found in Seller Center FeedStatus response');
    }

    const normalizedFeedId = toTrimmedStringOrNull(detail.Feed) ?? feedId;
    const statusValue = toTrimmedStringOrNull(detail.Status);

    if (!statusValue) {
      throw new Error('Feed status not found in Seller Center FeedStatus response');
    }

    const toOptionalNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || String(value).trim() === '') {
        return null;
      }
      const parsedNumber = Number(String(value).trim());
      return Number.isFinite(parsedNumber) ? parsedNumber : null;
    };

    return {
      success: true,
      feedId: normalizedFeedId,
      status: statusValue,
      action: toTrimmedStringOrNull(detail.Action),
      creationDate: toTrimmedStringOrNull(detail.CreationDate),
      updatedDate: toTrimmedStringOrNull(detail.UpdatedDate),
      source: toTrimmedStringOrNull(detail.Source),
      totalRecords: toOptionalNumber(detail.TotalRecords),
      processedRecords: toOptionalNumber(detail.ProcessedRecords),
      failedRecords: toOptionalNumber(detail.FailedRecords)
    };
  }
}
