// src/interfaces/http/controllers/documentController.ts

import { Request, Response } from "express";
import { GetShippingLabelByOrderIdUseCase } from "../../../application/use-cases/getShippingLabelByOrderIdUseCase";
import { logger } from "../../../infrastructure/logger/logger";

export class DocumentController {
  constructor(
    private readonly getShippingLabelByOrderIdUseCase: GetShippingLabelByOrderIdUseCase
  ) {}

  getShippingLabelByOrderId = async (req: Request, res: Response) => {
    const { orderId } = req.params;

    try {
      const result = await this.getShippingLabelByOrderIdUseCase.execute(orderId);

      res.setHeader("Content-Type", result.mimeType);
      // inline -> se ve en el navegador; usa "attachment" si quieres forzar descarga
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${result.fileName}"`
      );

      return res.send(result.buffer);
    } catch (err: any) {
      logger.error(
        { err: err?.message ?? err, orderId },
        "❌ Failed to get shipping label by orderId"
      );

      const message = err?.message ?? "Error getting shipping label";
      const status =
        message.includes("no items") || message.includes("not found") ? 404 : 500;

      return res.status(status).json({
        error: message,
      });
    }
  };
}
