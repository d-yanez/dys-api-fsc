// src/domain/products/product.ts

export interface ProductAttribute {
  name: string;
  value: string | number | boolean | null;
}

export interface Product {
  sku: string;
  name: string | null;
  description?: string | null;

  shopSku?: string | null;

  brand?: string | null;
  category?: string | null;

  url?: string | null;
  mainImage?: string | null;

  price?: number | null;
  salePrice?: number | null;
  currency?: string | null;

  quantity?: number | null; // cantidad referencial (puede usar Stock)
  stock?: number | null;    // stock real desde BusinessUnit.Stock

  variationAttributes?: ProductAttribute[] | null;

  packageHeight?: number | null;
  packageLength?: number | null;
  packageWidth?: number | null;
  packageWeight?: number | null;

  images?: string[] | null;

  status?: string | null;
  taxClass?: string | null;
  qcStatus?: string | null;
  contentScore?: number | null;

  extraAttributes?: any;
}