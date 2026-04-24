import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderController } from '../interfaces/http/controllers/orderController';

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };

  return res;
}

test('OrderController adds invoiceRequired and normalized financial fields', async () => {
  const controller = new OrderController({
    async execute() {
      return {
        orderId: '1150140518',
        raw: {
          OrderId: '1150140518',
          OrderNumber: '3231960534',
          InvoiceRequired: 'false',
          GrandTotal: '26,490.00',
          ProductTotal: '26,490.00',
          TaxAmount: '0.00',
          ShippingFeeTotal: '0.00',
          AddressBilling: { FirstName: 'Maria' },
          AddressShipping: { FirstName: 'Maria' },
          Statuses: { Status: 'shipped' },
          ExtraBillingAttributes: {
            LegalId: '96912840-3',
            ReceiverLegalName: 'AQUAGEN CHILE S.A.',
            ReceiverTypeRegimen: '032110 - CULTIVO Y CRIANZA DE PECES MARINOS',
            ReceiverEmail: 'yoselin.parra@aquagenchile.cl',
            ReceiverAddress: 'SAN FRANCISCO 328',
            ReceiverMunicipality: 'PUERTO VARAS - PUERTO VARAS'
          }
        }
      };
    }
  } as any);

  const req = {
    params: { orderId: '1150140518' }
  } as any;
  const res = createMockResponse();

  await controller.getOrderById(req, res as any);

  assert.equal(res.statusCode, 200);
  const body = res.body as any;
  assert.equal(body.invoiceRequired, false);
  assert.equal(body.financial.grandTotal, 26490);
  assert.equal(body.financial.productTotal, 26490);
  assert.equal(body.financial.taxAmount, 0);
  assert.equal(body.financial.shippingFeeTotal, 0);
  assert.deepEqual(body.addressBilling, { FirstName: 'Maria' });
  assert.deepEqual(body.addressShipping, { FirstName: 'Maria' });
  assert.equal(body.customer.legalId, '96912840-3');
  assert.equal(body.customer.receiverLegalName, 'AQUAGEN CHILE S.A.');
  assert.equal(body.customer.receiverTypeRegimen, '032110 - CULTIVO Y CRIANZA DE PECES MARINOS');
  assert.equal(body.customer.receiverEmail, 'yoselin.parra@aquagenchile.cl');
  assert.equal(body.customer.receiverAddress, 'SAN FRANCISCO 328');
  assert.equal(body.customer.receiverMunicipality, 'PUERTO VARAS - PUERTO VARAS');
  assert.deepEqual(body.extraBillingAttributes, {
    LegalId: '96912840-3',
    ReceiverLegalName: 'AQUAGEN CHILE S.A.',
    ReceiverTypeRegimen: '032110 - CULTIVO Y CRIANZA DE PECES MARINOS',
    ReceiverEmail: 'yoselin.parra@aquagenchile.cl',
    ReceiverAddress: 'SAN FRANCISCO 328',
    ReceiverMunicipality: 'PUERTO VARAS - PUERTO VARAS'
  });
});

test('OrderController normalizes extraBillingAttributes when parser returns array', async () => {
  const controller = new OrderController({
    async execute() {
      return {
        orderId: '1132545695',
        raw: {
          OrderId: '1132545695',
          OrderNumber: '3214796430',
          Statuses: { Status: 'delivered' },
          ExtraBillingAttributes: [
            {
              LegalId: '96912840-3',
              ReceiverLegalName: 'AQUAGEN CHILE S.A.'
            }
          ]
        }
      };
    }
  } as any);

  const req = { params: { orderId: '1132545695' } } as any;
  const res = createMockResponse();

  await controller.getOrderById(req, res as any);

  assert.equal(res.statusCode, 200);
  const body = res.body as any;
  assert.equal(body.customer.legalId, '96912840-3');
  assert.equal(body.customer.receiverLegalName, 'AQUAGEN CHILE S.A.');
  assert.deepEqual(body.extraBillingAttributes, {
    LegalId: '96912840-3',
    ReceiverLegalName: 'AQUAGEN CHILE S.A.'
  });
});
