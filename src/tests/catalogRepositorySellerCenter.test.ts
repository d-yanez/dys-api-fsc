import assert from 'node:assert/strict';
import test from 'node:test';
import { XMLParser } from 'fast-xml-parser';
import { __testables } from '../infrastructure/sellercenter/catalogRepositorySellerCenter';

test('resolveCategoryId prioriza categoryId numérico', () => {
  const categoryId = __testables.resolveCategoryId({
    sellerSku: 'x',
    name: 'n',
    primaryCategory: 'Muñecos de acción no eléctricos',
    categoryId: '2316',
  } as any);
  assert.equal(categoryId, '2316');
});

test('template 2316 arma ProductCreate con nodos requeridos', () => {
  const template = __testables.CATEGORY_TEMPLATE_REGISTRY['2316'];
  assert.ok(template);

  const productNode = template.buildProductNode(
    {
      sellerSku: '1929830110',
      name: 'Figura X',
      primaryCategory: '2316',
      description: 'desc',
      brand: 'GENERICO',
      productId: '1260512101001',
      productData: {
        Model: 'Zorro Nueve Colas Articulado',
        Material: 'ABS',
      },
      businessUnits: {
        OperatorCode: 'facl',
        Price: 129990,
        Stock: 2,
        Status: 'active',
      },
    } as any,
    '2316'
  );

  const xml = __testables.buildXmlRequest({ Product: productNode });
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
  const product = parsed?.Request?.Product;

  assert.equal(String(product?.SellerSku), '1929830110');
  assert.equal(String(product?.PrimaryCategory), '2316');
  assert.equal(product?.Brand, 'GENERICO');
  assert.equal(product?.BusinessUnits?.BusinessUnit?.OperatorCode, 'facl');
  assert.equal(product?.ProductData?.Material, 'ABS');
});

test('template 3367 existe y arma ProductCreate con nodos requeridos', () => {
  const template = __testables.CATEGORY_TEMPLATE_REGISTRY['3367'];
  assert.ok(template);

  const productNode = template.buildProductNode(
    {
      sellerSku: '1434239945',
      name: 'Mochila escolar',
      primaryCategory: '3367',
      description: 'desc',
      brand: 'GENERICO',
      productId: '1260521123001',
      productData: {
        Color: 'Blanco',
        Talla: '7',
        CantidadDeCompartimentos: 5,
        PackageHeight: 15,
        PackageLength: 40,
        PackageWeight: 0.2,
        PackageWidth: 30,
      },
      businessUnits: {
        OperatorCode: 'facl',
        Price: 72990,
        Stock: 1,
        Status: 'active',
      },
    } as any,
    '3367'
  );

  const xml = __testables.buildXmlRequest({ Product: productNode });
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
  const product = parsed?.Request?.Product;

  assert.equal(String(product?.SellerSku), '1434239945');
  assert.equal(String(product?.PrimaryCategory), '3367');
  assert.equal(product?.Color, 'Blanco');
  assert.equal(String(product?.Talla), '7');
  assert.equal(product?.ProductData?.CantidadDeCompartimentos, 5);
  assert.equal(product?.BusinessUnits?.BusinessUnit?.OperatorCode, 'facl');
});

test('toBusinessUnitArray normaliza campos válidos', () => {
  const units = __testables.toBusinessUnitArray({
    businessUnit: {
      Price: 1000,
      Stock: 2,
    },
  } as any);
  assert.equal(units.length, 1);
  assert.equal(units[0].OperatorCode, 'facl');
  assert.equal(units[0].Price, 1000);
  assert.equal(units[0].Stock, 2);
});
