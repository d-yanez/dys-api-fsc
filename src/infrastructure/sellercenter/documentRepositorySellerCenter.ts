// src/infrastructure/sellercenter/documentRepositorySellerCenter.ts

import { XMLParser } from "fast-xml-parser";
import { DocumentRepository } from "../../domain/documents/documentRepository";
import { ShippingLabel } from "../../domain/documents/shippingLabel";
import { buildSignedUrl, httpGet } from "./sellerCenterClient";
import { logger } from "../logger/logger";

export class DocumentRepositorySellerCenter implements DocumentRepository {
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      trimValues: true,
    });
  }

  async getShippingLabel(orderItemIds: string[]): Promise<ShippingLabel | null> {
    if (!orderItemIds || orderItemIds.length === 0) {
      logger.warn(
        { orderItemIds },
        "getShippingLabel called with empty orderItemIds"
      );
      return null;
    }

    // Falabella espera algo como [12345,67890]
    const orderItemIdsParam = `[${orderItemIds.join(",")}]`;

    const { url } = buildSignedUrl({
      Action: "GetDocument",
      DocumentType: "shippingParcel",
      OrderItemIds: orderItemIdsParam,
    });

    logger.info(
      { orderItemIds, url },
      "Calling Seller Center GetDocument (shippingParcel)"
    );

    const { status, body } = await httpGet(url);

    if (status !== 200) {
      logger.error(
        { status, bodySnippet: body.slice(0, 500) },
        "❌ GetDocument HTTP error from Seller Center"
      );
      throw new Error(`SellerCenter GetDocument HTTP ${status}`);
    }

    try {
      const parsed = this.xmlParser.parse(body) as any;

      const docNode =
        parsed?.SuccessResponse?.Body?.Documents?.Document ??
        parsed?.SuccessResponse?.Body?.Document;

      if (!docNode) {
        logger.error(
          { parsedSnippet: JSON.stringify(parsed).slice(0, 500) },
          "GetDocument: Document node not found in response"
        );
        return null;
      }

      const fileBase64: string | undefined = docNode.File;
      const mimeType: string = docNode.MimeType || "application/pdf";
      const documentType: string = docNode.DocumentType || "shippingParcel";

      if (!fileBase64) {
        logger.error(
          { docNodeSnippet: JSON.stringify(docNode).slice(0, 500) },
          "GetDocument: File (base64) not present in response"
        );
        return null;
      }

      const fileBuffer = Buffer.from(fileBase64, "base64");

      const label: ShippingLabel = {
        orderItemIds,
        documentType,
        mimeType,
        fileBase64,
        fileBuffer,
      };

      logger.info(
        {
          orderItemIds,
          documentType,
          mimeType,
          size: fileBuffer.length,
        },
        "✅ Shipping label retrieved from Seller Center"
      );

      return label;
    } catch (err: any) {
      logger.error(
        { err: err?.message ?? err, bodySnippet: body.slice(0, 500) },
        "❌ Failed to parse GetDocument XML"
      );
      throw new Error("Failed to parse GetDocument response");
    }
  }
}
