import test from 'node:test';
import assert from 'node:assert/strict';
import { UploadInvoicePDFUseCase } from '../application/use-cases/uploadInvoicePDFUseCase';
import { InvoicePDFRepository } from '../domain/invoice/invoicePdfRepository';

class FakeRepo implements InvoicePDFRepository {
  lastInput: any;
  async uploadPDF(input: any): Promise<any> {
    this.lastInput = input;
    return {
      ok: true,
      action: 'SetInvoicePDF',
      requestId: '123',
      alreadyExists: false,
      message: 'ok',
    };
  }
}

const validInput = {
  orderItemIds: ['164027299'],
  invoiceNumber: '8481',
  invoiceDate: '2026-04-22',
  invoiceType: 'BOLETA' as const,
  operatorCode: 'FACL',
  invoiceDocumentFormat: 'pdf' as const,
  invoiceDocument: 'JVBERi0xLjQ=',
};

test('UploadInvoicePDFUseCase normalizes and delegates', async () => {
  const repo = new FakeRepo();
  const uc = new UploadInvoicePDFUseCase(repo);
  const res = await uc.execute({
    ...validInput,
    orderItemIds: [' 164027299 '],
    invoiceType: 'boleta' as any,
  });
  assert.equal(res.ok, true);
  assert.equal(repo.lastInput.invoiceType, 'BOLETA');
  assert.deepEqual(repo.lastInput.orderItemIds, ['164027299']);
});

test('UploadInvoicePDFUseCase validates required fields', async () => {
  const uc = new UploadInvoicePDFUseCase(new FakeRepo());
  await assert.rejects(() => uc.execute({ ...validInput, orderItemIds: [] as any }), /Invalid orderItemIds/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceNumber: 'bad' as any }), /Invalid invoiceNumber/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceDate: '22-04-2026' as any }), /Invalid invoiceDate/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceType: 'NC' as any }), /Invalid invoiceType/);
  await assert.rejects(() => uc.execute({ ...validInput, operatorCode: '' as any }), /Invalid operatorCode/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceDocumentFormat: 'xml' as any }), /Invalid invoiceDocumentFormat/);
  await assert.rejects(() => uc.execute({ ...validInput, invoiceDocument: '' as any }), /Invalid invoiceDocument/);
});
