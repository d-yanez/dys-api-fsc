export interface InvoicePDFUploadInput {
  sellerOrderId?: string;
  orderItemIds: string[];
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: 'BOLETA' | 'FACTURA';
  operatorCode: string;
  invoiceDocumentFormat: 'pdf';
  invoiceDocument: string;
}

export type InvoicePDFE004DiagnosticCode =
  | 'REQUESTED_ITEMS_MISSING'
  | 'ITEM_STATUS_INELIGIBLE'
  | 'OWN_WAREHOUSE_ITEMS'
  | 'ITEMS_NOT_PROCESSABLE'
  | 'MULTIPLE_PACKAGES'
  | 'NO_MISMATCH_DETECTED'
  | 'DIAGNOSTIC_UNAVAILABLE';

export interface InvoicePDFE004Diagnostic {
  code: InvoicePDFE004DiagnosticCode;
  requestedItemCount: number;
  matchedItemCount: number | null;
  missingItemCount: number | null;
  statuses: string[];
  shippingTypes: string[];
  processability: {
    processable: number;
    notProcessable: number;
    unknown: number;
  } | null;
  packageCount: number | null;
}

export interface InvoicePDFUploadResult {
  ok: true;
  action: 'SetInvoicePDF';
  requestId: string | null;
  alreadyExists: boolean;
  message: string;
}

export interface InvoicePDFUploadErrorResult {
  ok: false;
  action: 'SetInvoicePDF';
  code: string | null;
  message: string;
  requestId: string | null;
}

export interface InvoicePDFRepository {
  uploadPDF(input: InvoicePDFUploadInput, options?: { signal?: AbortSignal }): Promise<InvoicePDFUploadResult>;
}
