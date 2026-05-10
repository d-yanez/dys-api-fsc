import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type {
  CatalogContentScoreInput,
  CatalogImageInput,
  CatalogProductCreateInput,
  CatalogRepository,
} from '../../domain/catalog/catalogRepository';
import { buildSignedUrl, httpGet, httpPost } from './sellerCenterClient';

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

function requiredString(v: unknown, field: string): string {
  const s = String(v ?? '').trim();
  if (!s) throw new Error(`${field} is required`);
  return s;
}

function buildXmlRequest(input: any): string {
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '', suppressEmptyNode: true });
  return builder.build({ Request: input });
}

export class CatalogRepositorySellerCenter implements CatalogRepository {
  async getBrands(): Promise<unknown> {
    const { url } = buildSignedUrl({ Action: 'GetBrands' });
    const { status, body } = await httpGet(url);
    if (status !== 200) throw new Error(`SellerCenter GetBrands HTTP ${status}`);
    return parseMaybeJsonOrXml(body);
  }

  async getCategoryTree(): Promise<unknown> {
    const { url } = buildSignedUrl({ Action: 'GetCategoryTree' });
    const { status, body } = await httpGet(url);
    if (status !== 200) throw new Error(`SellerCenter GetCategoryTree HTTP ${status}`);
    return parseMaybeJsonOrXml(body);
  }

  async getCategoryAttributes(categoryId: string): Promise<unknown> {
    const category = requiredString(categoryId, 'categoryId');
    const { url } = buildSignedUrl({ Action: 'GetCategoryAttributes', PrimaryCategory: category });
    const { status, body } = await httpGet(url);
    if (status !== 200) throw new Error(`SellerCenter GetCategoryAttributes HTTP ${status}`);
    return parseMaybeJsonOrXml(body);
  }

  async getContentScore(input: CatalogContentScoreInput): Promise<unknown> {
    const { payloadXml } = input;
    const { url } = buildSignedUrl({ Action: 'GetContentScore', Format: 'XML' });

    const xml = payloadXml && payloadXml.trim() !== ''
      ? payloadXml
      : buildXmlRequest({
          Product: {
            SellerSku: requiredString(input.sellerSku ?? 'dry-run-sku', 'sellerSku'),
            Name: requiredString(input.name, 'name'),
            PrimaryCategory: requiredString(input.primaryCategory, 'primaryCategory'),
            Description: String(input.description ?? '').trim(),
            Brand: String(input.brand ?? '').trim(),
          },
        });

    const { status, body } = await httpPost(url, xml, {
      'Content-Type': 'application/xml',
      Accept: 'application/xml',
    });
    if (status !== 200) throw new Error(`SellerCenter GetContentScore HTTP ${status}`);
    return parseMaybeJsonOrXml(body);
  }

  async productCreate(input: CatalogProductCreateInput): Promise<unknown> {
    const { payloadXml } = input;
    const { url } = buildSignedUrl({ Action: 'ProductCreate', Format: 'XML' });

    const xml = payloadXml && payloadXml.trim() !== ''
      ? payloadXml
      : buildXmlRequest({
          Product: {
            SellerSku: requiredString(input.sellerSku, 'sellerSku'),
            Name: requiredString(input.name, 'name'),
            PrimaryCategory: requiredString(input.primaryCategory, 'primaryCategory'),
            Description: String(input.description ?? '').trim(),
            Brand: String(input.brand ?? '').trim(),
          },
        });

    const { status, body } = await httpPost(url, xml, {
      'Content-Type': 'application/xml',
      Accept: 'application/xml',
    });
    if (status !== 200) throw new Error(`SellerCenter ProductCreate HTTP ${status}`);
    const parsed = parseMaybeJsonOrXml(body);
    return {
      ok: true,
      feedId: extractFeedId(parsed),
      raw: parsed,
    };
  }

  async image(input: CatalogImageInput): Promise<unknown> {
    const { payloadXml } = input;
    const { url } = buildSignedUrl({ Action: 'Image', Format: 'XML' });

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
    return {
      ok: true,
      feedId: extractFeedId(parsed),
      raw: parsed,
    };
  }
}
