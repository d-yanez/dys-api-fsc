// src/interfaces/http/routes/documentRoutes.ts

import { Router } from "express";
import { DocumentRepositorySellerCenter } from "../../../infrastructure/sellercenter/documentRepositorySellerCenter";
import { OrderItemRepositorySellerCenter } from "../../../infrastructure/sellercenter/orderItemRepositorySellerCenter";
import { GetShippingLabelByOrderIdUseCase } from "../../../application/use-cases/getShippingLabelByOrderIdUseCase";
import { DocumentController } from "../controllers/documentController";
import { apiKeyAuth } from "../middlewares/apiKeyAuth";

const router = Router();

// Wiring de dependencias
const documentRepository = new DocumentRepositorySellerCenter();
const orderItemRepository = new OrderItemRepositorySellerCenter();
const getShippingLabelByOrderIdUseCase = new GetShippingLabelByOrderIdUseCase(
  orderItemRepository,
  documentRepository
);
const documentController = new DocumentController(getShippingLabelByOrderIdUseCase);

// GET /label/order/:orderId
router.get(
  "/order/:orderId",
  apiKeyAuth,
  documentController.getShippingLabelByOrderId
);

export { router as documentRouter };
