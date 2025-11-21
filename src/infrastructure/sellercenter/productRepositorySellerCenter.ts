import { ProductRepository } from "../../domain/products/productRepository";
import { Product, ProductAttribute } from "../../domain/products/product";
import { buildSignedUrl, httpGet } from "./sellerCenterClient";
import { logger } from "../logger/logger";
import { env } from "../config/env";
import { XMLParser } from "fast-xml-parser";

export class ProductRepositorySellerCenter implements ProductRepository {
  private xmlParser: XMLParser;

  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
    });
  }

  async getProductBySku(sku: string): Promise<Product | null> {
    const { url } = buildSignedUrl({
      Action: "GetProducts",
      SkuSellerList: sku,
    });

    const { status, body } = await httpGet(url);

    if (status !== 200) {
      logger.error(
        { status, bodySnippet: body.slice(0, 300) },
        "❌ Non-200 response from Seller Center GetProducts"
      );
      throw new Error(`SellerCenter GetProducts HTTP ${status}`);
    }

    let productsNode: any;

    try {
      const format = (env.scFormat ?? "XML").toUpperCase();

      if (format === "JSON") {
        const parsedJson = JSON.parse(body) as any;
        productsNode = parsedJson?.SuccessResponse?.Body?.Products?.Product;
      } else {
        const parsedXml = this.xmlParser.parse(body) as any;
        productsNode = parsedXml?.SuccessResponse?.Body?.Products?.Product;
      }

      // Fallback: siempre intentar XML si lo anterior no trajo nada
      if (!productsNode) {
        const parsedXml = this.xmlParser.parse(body) as any;
        productsNode = parsedXml?.SuccessResponse?.Body?.Products?.Product;
      }
    } catch (err: any) {
      logger.error(
        { err: err?.message ?? err, bodySnippet: body.slice(0, 600) },
        "❌ Failed to parse Seller Center GetProducts response (JSON/XML)"
      );
      throw new Error(
        "Failed to parse Seller Center GetProducts response (JSON/XML)."
      );
    }

    if (!productsNode) {
      logger.warn(
        { sku, bodySnippet: body.slice(0, 400) },
        "⚠️ No Product data in Seller Center response"
      );
      return null;
    }

    const productNode = Array.isArray(productsNode) ? productsNode[0] : productsNode;

    // --- ExtraAttributes (si existiera como JSON string plano) ---
    let extraAttrs: any = null;
    if (
      typeof productNode.ExtraAttributes === "string" &&
      productNode.ExtraAttributes.trim() !== ""
    ) {
      try {
        extraAttrs = JSON.parse(productNode.ExtraAttributes);
      } catch {
        extraAttrs = null;
      }
    }

    // --- BusinessUnit principal (Price, SpecialPrice, Stock, Status, etc.) ---
    const buRaw = productNode.BusinessUnits?.BusinessUnit;
    const buNode = Array.isArray(buRaw) ? buRaw[0] : buRaw ?? null;

    // --- ProductData (dimensiones y otros metadatos) ---
    const productData = productNode.ProductData ?? null;

    // --- variationAttributes ---
    const variationAttributes: ProductAttribute[] | null =
      productNode.Variation && typeof productNode.Variation === "object"
        ? Object.entries(productNode.Variation as Record<string, unknown>).map(
            ([name, value]): ProductAttribute => ({
              name,
              value:
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
                  ? value
                  : value == null
                  ? null
                  : String(value),
            })
          )
        : null;

    // --- Imágenes ---
    const images: string[] | null =
      productNode.Images?.Image != null
        ? Array.isArray(productNode.Images.Image)
          ? productNode.Images.Image
          : [productNode.Images.Image]
        : null;

    // --- Precio y oferta ---
    const price =
      buNode?.Price != null && buNode.Price !== ""
        ? Number(buNode.Price)
        : productNode.Price != null && productNode.Price !== ""
        ? Number(productNode.Price)
        : null;

    const salePrice =
      buNode?.SpecialPrice != null && buNode.SpecialPrice !== ""
        ? Number(buNode.SpecialPrice)
        : productNode.SalePrice != null && productNode.SalePrice !== ""
        ? Number(productNode.SalePrice)
        : null;

    // --- Stock / quantity ---
    const stock =
      buNode?.Stock != null && buNode.Stock !== ""
        ? Number(buNode.Stock)
        : null;

    const quantity =
      productNode.Quantity != null && productNode.Quantity !== ""
        ? Number(productNode.Quantity)
        : stock;

    // --- Dimensiones: primero ProductData, luego campos planos ---
    const packageHeight =
      productData?.PackageHeight != null && productData.PackageHeight !== ""
        ? Number(productData.PackageHeight)
        : productNode.PackageHeight != null &&
          productNode.PackageHeight !== ""
        ? Number(productNode.PackageHeight)
        : null;

    const packageLength =
      productData?.PackageLength != null && productData.PackageLength !== ""
        ? Number(productData.PackageLength)
        : productNode.PackageLength != null &&
          productNode.PackageLength !== ""
        ? Number(productNode.PackageLength)
        : null;

    const packageWidth =
      productData?.PackageWidth != null && productData.PackageWidth !== ""
        ? Number(productData.PackageWidth)
        : productNode.PackageWidth != null &&
          productNode.PackageWidth !== ""
        ? Number(productNode.PackageWidth)
        : null;

    const packageWeight =
      productData?.PackageWeight != null && productData.PackageWeight !== ""
        ? Number(productData.PackageWeight)
        : productNode.PackageWeight != null &&
          productNode.PackageWeight !== ""
        ? Number(productNode.PackageWeight)
        : null;

    // --- Status / QC / tax ---
    const rawStatus =
      buNode?.Status ?? productNode.Status ?? productNode.QCStatus ?? null;

    const taxClass =
      productNode.TaxClass != null && productNode.TaxClass !== ""
        ? String(productNode.TaxClass)
        : null;

    const qcStatus =
      productNode.QCStatus != null && productNode.QCStatus !== ""
        ? String(productNode.QCStatus)
        : null;

    const contentScore =
      productNode.ContentScore != null && productNode.ContentScore !== ""
        ? Number(productNode.ContentScore)
        : null;

    // --- Unir extraAttributes con metadata útil (sin hacer el JSON gigante) ---
    const combinedExtraAttrs =
      productData || buNode || extraAttrs
        ? {
            ...(extraAttrs || {}),
            productData: productData || undefined,
            businessUnit: buNode || undefined,
          }
        : null;

    // 👇 AQUÍ forzamos la conversión a string | null al asignar al Product
    const product: Product = {
      sku: String(productNode.SellerSku ?? productNode.Sku),
      name: productNode.Name ?? null,
      description: productNode.Description ?? null,

      shopSku:
        productNode.ShopSku != null
          ? String(productNode.ShopSku)
          : productNode.SellerSku != null
          ? String(productNode.SellerSku)
          : null,

      brand: productNode.Brand ?? null,
      category: productNode.PrimaryCategory ?? null,

      url: productNode.Url ?? null,
      mainImage: productNode.MainImage ?? (images?.[0] ?? null),

      price,
      salePrice,
      currency: productNode.Currency ?? "CLP",

      quantity,
      stock,

      variationAttributes,

      packageHeight,
      packageLength,
      packageWidth,
      packageWeight,

      images,

      // 🔥 aquí TS ya no se queja
      status:
        rawStatus != null && rawStatus !== "" ? String(rawStatus) : null,

      taxClass,
      qcStatus,
      contentScore,

      extraAttributes: combinedExtraAttrs,
    };

    return product;
  }
}