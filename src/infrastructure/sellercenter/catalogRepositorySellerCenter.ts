import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import crypto from 'crypto';
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
  const source = Array.isArray(raw) ? raw : [raw];
  const mapped = source
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const unit = item as Record<string, unknown>;
      const normalized: Record<string, unknown> = {
        OperatorCode: firstNonEmpty(unit.OperatorCode, 'facl'),
      };
      const optionalKeys = ['Price', 'SpecialPrice', 'SpecialFromDate', 'SpecialToDate', 'Stock', 'Status'];
      for (const key of optionalKeys) {
        const value = unit[key];
        const normalizedValue = String(value ?? '').trim();
        if (normalizedValue !== '') {
          normalized[key] = value;
        }
      }
      return normalized;
    })
    .filter((unit) => String(unit.OperatorCode ?? '').trim() !== '');
  return mapped;
}

function toProductDataMap(input: any): Record<string, unknown> {
  const raw = input?.productData ?? input?.attributes ?? input?.extraAttributes?.productData;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function buildXmlRequest(input: any): string {
  const builder = new XMLBuilder({ ignoreAttributes: true, suppressEmptyNode: true });
  return builder.build({ Request: input });
}

type CategoryTemplate = {
  templateId: string;
  buildProductNode: (input: CatalogProductCreateInput, categoryId: string) => Record<string, unknown>;
};

function buildDefaultCategoryProductNode(input: CatalogProductCreateInput, categoryId: string): Record<string, unknown> {
  const typedInput = input as any;
  const sellerSku = requiredString(firstNonEmpty(typedInput.sellerSku, typedInput.newSellerSku), 'sellerSku');
  const name = requiredString(firstNonEmpty(typedInput.name, typedInput.title), 'name');
  const description = requiredString(firstNonEmpty(typedInput.description), 'description');
  const brand = requiredString(firstNonEmpty(typedInput.brand), 'brand');
  const parentSku = firstNonEmpty(typedInput.parentSku, sellerSku);
  const productId = firstNonEmpty(typedInput.productId);
  const variation = firstNonEmpty(typedInput.variation);
  const colorBasico = firstNonEmpty(typedInput.colorBasico);
  const color = firstNonEmpty(typedInput.color, typedInput.Color, String((typedInput?.productData ?? typedInput?.attributes ?? {})?.Color ?? '').trim());
  const talla = firstNonEmpty(typedInput.talla, typedInput.Talla, String((typedInput?.productData ?? typedInput?.attributes ?? {})?.Talla ?? '').trim());
  const productData = toProductDataMap(typedInput);
  const businessUnits = toBusinessUnitArray(typedInput);

  return {
    SellerSku: sellerSku,
    ParentSku: parentSku,
    Name: name,
    PrimaryCategory: categoryId,
    Brand: brand,
    ...(productId !== '' ? { ProductId: productId } : {}),
    Description: description,
    ...(variation !== '' ? { Variation: variation } : {}),
    ...(colorBasico !== '' ? { ColorBasico: colorBasico } : {}),
    ...(color !== '' ? { Color: color } : {}),
    ...(talla !== '' ? { Talla: talla } : {}),
    ...(Object.keys(productData).length > 0 ? { ProductData: productData } : {}),
    ...(businessUnits.length > 0
      ? {
          BusinessUnits: {
            BusinessUnit: businessUnits,
          },
        }
      : {}),
  };
}

const CATEGORY_TEMPLATE_REGISTRY: Record<string, CategoryTemplate> = {
  '2316': {
    templateId: 'cat-2316-v1',
    buildProductNode: buildDefaultCategoryProductNode,
  },
  '3367': {
    templateId: 'cat-3367-v1',
    buildProductNode: buildDefaultCategoryProductNode,
  },
};

function resolveCategoryId(input: CatalogProductCreateInput): string {
  const typedInput = input as any;
  const candidate = firstNonEmpty(typedInput.categoryId, typedInput.primaryCategoryId, typedInput.primaryCategory);
  if (/^\d+$/.test(candidate)) return candidate;
  return '';
}

function payloadFingerprint(payload: Record<string, unknown>): string {
  const serialized = JSON.stringify(payload);
  return crypto.createHash('sha1').update(serialized).digest('hex');
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
    const categoryId = resolveCategoryId(input);
    const template = CATEGORY_TEMPLATE_REGISTRY[categoryId];
    const isRawPayload = payloadXml && payloadXml.trim() !== '';
    if (!isRawPayload && !template) {
      throw new Error(`category_template_not_found: ${categoryId || 'missing'}`);
    }
    const productNode = !isRawPayload && template ? template.buildProductNode(input, categoryId) : {};
    const effectivePayload = !isRawPayload ? { Product: productNode } : {};
    const xml = isRawPayload ? String(payloadXml) : buildXmlRequest(effectivePayload);
    const sellerSku = !isRawPayload ? String((productNode as any).SellerSku ?? '') : '';
    const name = !isRawPayload ? String((productNode as any).Name ?? '') : '';
    const primaryCategory = !isRawPayload ? String((productNode as any).PrimaryCategory ?? '') : '';
    const businessUnitsCount = !isRawPayload
      ? (Array.isArray((productNode as any)?.BusinessUnits?.BusinessUnit)
          ? (productNode as any).BusinessUnits.BusinessUnit.length
          : ((productNode as any)?.BusinessUnits?.BusinessUnit ? 1 : 0))
      : 0;
    const productDataKeys = !isRawPayload && typeof (productNode as any)?.ProductData === 'object'
      ? Object.keys((productNode as any).ProductData).length
      : 0;

    logger.info(
      {
        sellerSku,
        name,
        primaryCategory,
        categoryId: categoryId || null,
        templateId: isRawPayload ? 'raw-payload' : template?.templateId ?? null,
        hasDescription: !isRawPayload ? String((productNode as any).Description ?? '').trim() !== '' : null,
        hasBrand: !isRawPayload ? String((productNode as any).Brand ?? '').trim() !== '' : null,
        businessUnitsCount,
        productDataKeys,
        payloadFingerprint: !isRawPayload ? payloadFingerprint(effectivePayload) : null,
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
        `SellerCenter ProductCreate ErrorResponse${parsedError.code ? ` [${parsedError.code}]` : ''}${parsedError.message ? ` ${parsedError.message}` : ''} body=${body.slice(0, 1200)}`
      );
    }
    const feedId = extractFeedId(parsed);
    if (!feedId) {
      throw new Error('SellerCenter ProductCreate returned success without feedId');
    }
    return {
      ok: true,
      feedId,
      categoryId: categoryId || null,
      templateId: isRawPayload ? 'raw-payload' : template?.templateId ?? null,
      raw: parsed,
    };
  }

  async image(input: CatalogImageInput): Promise<unknown> {
    const { payloadXml } = input;
    const { url } = buildSignedUrl({ Action: 'Image', Version: '1.0', Format: 'XML' });

    const images = Array.isArray(input.images) ? input.images.filter((i) => String(i).trim() !== '').slice(0, 8) : [];
    if (images.length === 0 && !(payloadXml && payloadXml.trim() !== '')) {
      throw new Error('images is required');
    }

    const xml = payloadXml && payloadXml.trim() !== ''
      ? payloadXml
      : buildXmlRequest({
          ProductImage: {
            SellerSku: requiredString(input.sellerSku, 'sellerSku'),
            Images: {
              Image: images.map((url) => String(url).trim()),
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

export const __testables = {
  resolveCategoryId,
  toBusinessUnitArray,
  toProductDataMap,
  buildXmlRequest,
  CATEGORY_TEMPLATE_REGISTRY,
};
