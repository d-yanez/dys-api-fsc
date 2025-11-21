// src/domain/documents/documentRepository.ts

import { ShippingLabel } from "./shippingLabel";

export interface DocumentRepository {
  /**
   * Obtiene la etiqueta de despacho (u otro documento) para los OrderItemIds indicados.
   * Internamente usa GetDocument de Seller Center.
   */
  getShippingLabel(orderItemIds: string[]): Promise<ShippingLabel | null>;
}
