import { Router } from "express";
import { ProductRepositorySellerCenter } from "../../../infrastructure/sellercenter/productRepositorySellerCenter";
import { GetProductBySkuUseCase } from "../../../application/use-cases/getProductBySkuUseCase";
import { ProductController } from "../controllers/productController";

const router = Router();

const repo = new ProductRepositorySellerCenter();
const useCase = new GetProductBySkuUseCase(repo);
const controller = new ProductController(useCase);

router.get("/:sku", controller.getProductBySku);

export { router as productRouter };