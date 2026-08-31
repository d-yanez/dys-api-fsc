export interface CatalogProductCreateInput {
  sellerSku: string;
  name: string;
  primaryCategory: string;
  description?: string;
  brand?: string;
  taxClass?: string;
  images?: string[];
  attributes?: Array<{ name: string; value: string }>;
  payloadXml?: string;
}

export interface CatalogImageInput {
  sellerSku: string;
  images: string[];
  payloadXml?: string;
}

export interface CatalogContentScoreInput {
  sellerSku?: string;
  primaryCategory: string;
  name: string;
  description?: string;
  brand?: string;
  images?: string[];
  attributes?: Array<{ name: string; value: string }>;
  payloadXml?: string;
}

export interface CatalogRepository {
  getBrands(): Promise<unknown>;
  getCategoryTree(): Promise<unknown>;
  getCategoryAttributes(categoryId: string): Promise<unknown>;
  getContentScore(input: CatalogContentScoreInput): Promise<unknown>;
  productCreate(input: CatalogProductCreateInput): Promise<unknown>;
  image(input: CatalogImageInput): Promise<unknown>;
}
