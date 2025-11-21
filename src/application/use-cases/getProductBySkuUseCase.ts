import { ProductRepository } from "../../domain/products/productRepository";
import { Product } from "../../domain/products/product";

export class GetProductBySkuUseCase {
  constructor(private readonly repo: ProductRepository) {}

  async execute(sku: string): Promise<Product | null> {
    if (!sku || !/^\d+$/.test(sku)) {
      throw new Error("SKU inválido. Debe ser numérico.");
    }

    return this.repo.getProductBySku(sku);
  }
}