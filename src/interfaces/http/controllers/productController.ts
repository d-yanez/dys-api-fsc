import { Request, Response } from "express";
import { GetProductBySkuUseCase } from "../../../application/use-cases/getProductBySkuUseCase";
import { logger } from "../../../infrastructure/logger/logger";

export class ProductController {
  constructor(private readonly useCase: GetProductBySkuUseCase) {}

  getProductBySku = async (req: Request, res: Response) => {
    const { sku } = req.params;

    try {
      const product = await this.useCase.execute(sku);

      if (!product) {
        return res.status(404).json({ error: "Producto no encontrado" });
      }

      return res.status(200).json(product);
    } catch (err: any) {
      logger.error(
        { sku, error: err?.message },
        "❌ Error en ProductController.getProductBySku"
      );

      return res.status(400).json({
        error: err?.message ?? "Error consultando producto",
      });
    }
  };
}