import { InvoicePDFRepository, InvoicePDFUploadInput, InvoicePDFUploadResult } from '../../domain/invoice/invoicePdfRepository';

export class UploadInvoicePDFUseCase {
  constructor(private readonly repository: InvoicePDFRepository) {}

  async execute(input: InvoicePDFUploadInput): Promise<InvoicePDFUploadResult> {
    const orderItemIds = Array.isArray(input.orderItemIds)
      ? input.orderItemIds.map((v) => String(v).trim()).filter(Boolean)
      : [];

    if (orderItemIds.length === 0) {
      throw new Error('Invalid orderItemIds');
    }

    const invoiceNumber = String(input.invoiceNumber ?? '').trim();
    if (!/^\d+$/.test(invoiceNumber)) {
      throw new Error('Invalid invoiceNumber');
    }

    const invoiceDate = String(input.invoiceDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      throw new Error('Invalid invoiceDate');
    }

    const invoiceTypeRaw = String(input.invoiceType ?? '').trim().toUpperCase();
    if (invoiceTypeRaw !== 'BOLETA' && invoiceTypeRaw !== 'FACTURA') {
      throw new Error('Invalid invoiceType');
    }

    const operatorCode = String(input.operatorCode ?? '').trim();
    if (!operatorCode) {
      throw new Error('Invalid operatorCode');
    }

    const invoiceDocumentFormat = String(input.invoiceDocumentFormat ?? '').trim().toLowerCase();
    if (invoiceDocumentFormat !== 'pdf') {
      throw new Error('Invalid invoiceDocumentFormat');
    }

    const invoiceDocument = String(input.invoiceDocument ?? '').trim();
    if (!invoiceDocument) {
      throw new Error('Invalid invoiceDocument');
    }

    return this.repository.uploadPDF({
      orderItemIds,
      invoiceNumber,
      invoiceDate,
      invoiceType: invoiceTypeRaw as 'BOLETA' | 'FACTURA',
      operatorCode,
      invoiceDocumentFormat: 'pdf',
      invoiceDocument,
    });
  }
}
