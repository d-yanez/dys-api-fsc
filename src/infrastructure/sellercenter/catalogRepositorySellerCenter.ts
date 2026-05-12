import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type {
  CatalogContentScoreInput,
  CatalogImageInput,
  CatalogProductCreateInput,
  CatalogRepository,
} from '../../domain/catalog/catalogRepository';
import { buildSignedUrl, httpGet, httpPost } from './sellerCenterClient';
import { logger } from '../logger/logger';

function parseMaybeJsonOrXml(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    return parser.parse(raw);
  }
}

function extractFeedId(parsed: any): string | null {
  const candidates = [
    parsed?.SuccessResponse?.Body?.FeedID,
    parsed?.SuccessResponse?.Body?.FeedId,
    parsed?.SuccessResponse?.Body?.Feed,
    parsed?.SuccessResponse?.Head?.RequestId,
    parsed?.feedId,
    parsed?.data?.feedId,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== '') return String(c).trim();
  }
  return null;
}

function extractError(parsed: any): { code: string | null; message: string | null } | null {
  const head = parsed?.ErrorResponse?.Head;
  if (!head) return null;
  const code = head?.ErrorCode != null ? String(head.ErrorCode).trim() : null;
  const message = head?.ErrorMessage != null ? String(head.ErrorMessage).trim() : null;
  return { code: code || null, message: message || null };
}

function requiredString(v: unknown, field: string): string {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`${field} is required`);
  return s;
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized !== '') return normalized;
  }
  return '';
}

function toBusinessUnitArray(input: any): Record<string, unknown>[] {
  const raw = input?.businessUnits ?? input?.businessUnit ?? input?.extraAttributes?.businessUnit;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((item) => item && typeof item === 'object') as Record<string, unknown>[];
  }
  if (typeof raw === 'object') return [raw as Record<string, unknown>];
  return [];
}

function toProductDataMap(input: any): Record<string, unknown> {
  const raw = input?.productData ?? input?.attributes ?? input?.extraAttributes?.productData;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function buildXmlRequest(input: any): string {
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '', suppressEmptyNode: true });
  return builder.build({ Request: input });
}

export class CatalogRepositorySellerCenter implements CatalogRepository {
  async getBrands(): Promise<unknown> {
    const { url } = buildSignedUrl({ Action: 'GetBrands', Version: '1.0' });
    const { status, body } = await httpGet(url);
    if (status !== 200) throw new Error(`SellerCenter GetBrands HTTP ${status}`);
    return parseMaybeJsonOrXml(body);
  }

  async getCategoryTree(): Promise<unknown> {
    const { url } = buildSignedUrl({ Action: 'GetCategoryTree', Version: '1.0' });
    const { status, body } = await httpGet(url);
    if (status !== 200) throw new Error(`SellerCenter GetCategoryTree HTTP ${status}`);
    return parseMaybeJsonOrXml(body);
  }

  async getCategoryAttributes(categoryId: string): Promise<unknown> {
    const category = requiredString(categoryId, 'categoryId');
    const { url } = buildSignedUrl({ Action: 'GetCategoryAttributes', Version: '1.0', PrimaryCategory: category });
    const { status, body } = await httpGet(url);
    if (status !== 200) throw new Error(`SellerCenter GetCategoryAttributes HTTP ${status}`);
    return parseMaybeJsonOrXml(body);
  }

  async getContentScore(input: CatalogContentScoreInput): Promise<unknown> {
    const categoryId = requiredString((input as any).categoryId ?? input.primaryCategory, 'categoryId');
    const operator = String((input as any).operator ?? 'facl').trim() || 'facl';
    const getRulesOnly = String((input as any).getRulesOnly ?? '1').trim() || '1';

    const { url } = buildSignedUrl({
      Action: 'GetContentScore',
      Version: '1.0',
      Format: 'XML',
      CategoryId: categoryId,
      GetRulesOnly: getRulesOnly,
      Operator: operator,
    });

    const { status, body } = await httpGet(url);
    if (status !== 200) throw new Error(`SellerCenter GetContentScore HTTP ${status}`);
    return parseMaybeJsonOrXml(body);
  }

  async productCreate(input: CatalogProductCreateInput): Promise<unknown> {
    const { payloadXml } = input;
    const { url } = buildSignedUrl({ Action: 'ProductCreate', Version: '1.0', Format: 'XML' });

    const sellerSku = firstNonEmpty((input as any).sellerSku, (input as any).newSellerSku);
    const name = firstNonEmpty((input as any).name, (input as any).title);
    const primaryCategory = firstNonEmpty(
      (input as any).primaryCategory,
      (input as any).category,
      (input as any).primaryCategoryId,
      (input as any).categoryId
    );
    const description = firstNonEmpty((input as any).description);
    const brand = firstNonEmpty((input as any).brand);
    const businessUnits = toBusinessUnitArray(input);
    const productData = toProductDataMap(input);

    const xml = payloadXml && payloadXml.trim() !== ''
      ? payloadXml
      : buildXmlRequest({
          Product: {
            SellerSku: requiredString(sellerSku, 'sellerSku'),
            Name: requiredString(name, 'name'),
            PrimaryCategory: requiredString(primaryCategory, 'primaryCategory'),
            Description: requiredString(description, 'description'),
            Brand: requiredString(brand, 'brand'),
            ...(businessUnits.length > 0
              ? {
                  BusinessUnits: {
                    BusinessUnit: businessUnits,
                  },
                }
              : {}),
            ...(Object.keys(productData).length > 0
              ? {
                  ProductData: productData,
                }
              : {}),
          },
        });

    logger.info(
      {
        sellerSku,
        name,
        primaryCategory,
        hasDescription: description !== '',
        hasBrand: brand !== '',
        businessUnitsCount: businessUnits.length,
        productDataKeys: Object.keys(productData).length,
        xmlPreview: xml.slice(0, 800),
      },
      'catalog_product_create_payload_built'
    );

    const { status, body } = await httpPost(url, xml, {
      'Content-Type': 'application/xml',
      Accept: 'application/xml',
    });
    if (status !== 200) throw new Error(`SellerCenter ProductCreate HTTP ${status}`);
    const parsed = parseMaybeJsonOrXml(body);
    const parsedError = extractError(parsed);
    if (parsedError) {
      throw new Error(
        `SellerCenter ProductCreate ErrorResponse${parsedError.code ? ` [${parsedError.code}]` : ''}${parsedError.message ? ` ${parsedError.message}` : ''}`
      );
    }
    const feedId = extractFeedId(parsed);
    if (!feedId) {
      throw new Error('SellerCenter ProductCreate returned success without feedId');
    }
    return {
      ok: true,
      feedId,
      raw: parsed,
    };
  }

  async image(input: CatalogImageInput): Promise<unknown> {
    const { payloadXml } = input;
    const { url } = buildSignedUrl({ Action: 'Image', Version: '1.0', Format: 'XML' });

    const images = Array.isArray(input.images) ? input.images.filter((i) => String(i).trim() !== '') : [];
    if (images.length === 0 && !(payloadXml && payloadXml.trim() !== '')) {
      throw new Error('images is required');
    }

    const xml = payloadXml && payloadXml.trim() !== ''
      ? payloadXml
      : buildXmlRequest({
          ProductImage: {
            SellerSku: requiredString(input.sellerSku, 'sellerSku'),
            Images: {
              Image: images.map((url) => ({ Url: String(url).trim() })),
            },
          },
        });

    const { status, body } = await httpPost(url, xml, {
      'Content-Type': 'application/xml',
      Accept: 'application/xml',
    });
    if (status !== 200) throw new Error(`SellerCenter Image HTTP ${status}`);
    const parsed = parseMaybeJsonOrXml(body);
    const parsedError = extractError(parsed);
    if (parsedError) {
      throw new Error(
        `SellerCenter Image ErrorResponse${parsedError.code ? ` [${parsedError.code}]` : ''}${parsedError.message ? ` ${parsedError.message}` : ''}`
      );
    }
    const feedId = extractFeedId(parsed);
    if (!feedId) {
      throw new Error('SellerCenter Image returned success without feedId');
    }
    return {
      ok: true,
      feedId,
      raw: parsed,
    };
  }
}
