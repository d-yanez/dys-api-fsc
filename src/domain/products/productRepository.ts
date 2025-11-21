// src/domain/products/productRepository.ts

import { Product } from './product';

export interface ProductRepository {
  getProductBySku(sku: string): Promise<Product | null>;
}