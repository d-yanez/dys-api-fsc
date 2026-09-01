import type {
  CatalogContentScoreInput,
  CatalogImageInput,
  CatalogProductCreateInput,
  CatalogProductUpdateInput,
  CatalogRepository,
} from '../../domain/catalog/catalogRepository';

export class CatalogUseCase {
  constructor(private readonly repository: CatalogRepository) {}

  async getBrands() {
    return this.repository.getBrands();
  }

  async getCategoryTree() {
    return this.repository.getCategoryTree();
  }

  async getCategoryAttributes(categoryId: string) {
    return this.repository.getCategoryAttributes(categoryId);
  }

  async getContentScore(input: CatalogContentScoreInput) {
    return this.repository.getContentScore(input);
  }

  async productCreate(input: CatalogProductCreateInput) {
    return this.repository.productCreate(input);
  }

  async productUpdate(input: CatalogProductUpdateInput) {
    return this.repository.productUpdate(input);
  }

  async image(input: CatalogImageInput) {
    return this.repository.image(input);
  }
}
