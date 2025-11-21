// src/domain/documents/shippingLabel.ts

export interface ShippingLabel {
  orderItemIds: string[];
  documentType: string;
  mimeType: string;
  fileBase64: string;
  fileBuffer: Buffer;
}
