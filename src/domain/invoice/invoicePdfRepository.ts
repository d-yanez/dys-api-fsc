export interface InvoicePDFUploadInput {
  orderItemIds: string[];
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: 'BOLETA' | 'FACTURA';
  operatorCode: string;
  invoiceDocumentFormat: 'pdf';
  invoiceDocument: string;
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
  uploadPDF(input: InvoicePDFUploadInput): Promise<InvoicePDFUploadResult>;
}
