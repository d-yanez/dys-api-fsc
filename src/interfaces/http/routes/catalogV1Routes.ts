import { Router } from 'express';
import { CatalogRepositorySellerCenter } from '../../../infrastructure/sellercenter/catalogRepositorySellerCenter';
import { CatalogUseCase } from '../../../application/use-cases/catalogUseCase';
import { CatalogV1Controller } from '../controllers/catalogV1Controller';

export function createCatalogV1Router(): Router {
  const router = Router();
  const repository = new CatalogRepositorySellerCenter();
  const useCase = new CatalogUseCase(repository);
  const controller = new CatalogV1Controller(useCase);

  router.get('/brands', controller.getBrands);
  router.get('/category-tree', controller.getCategoryTree);
  router.get('/categories/:categoryId/attributes', controller.getCategoryAttributes);
  router.post('/content-score', controller.getContentScore);
  router.post('/products/create', controller.productCreate);
  router.post('/products/update', controller.productUpdate);
  router.post('/products/image', controller.image);

  return router;
}

const catalogV1Router = createCatalogV1Router();

export { catalogV1Router };
