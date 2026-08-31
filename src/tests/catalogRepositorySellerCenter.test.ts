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
  assert.equal(Object.prototype.hasOwnProperty.call(product, 'TaxClass'), false);
  assert.equal(product?.BusinessUnits?.BusinessUnit?.OperatorCode, 'facl');
  assert.equal(product?.ProductData?.Material, 'ABS');
});

test('template 1584 se resuelve y arma ProductCreate con su categoría', () => {
  const template = __testables.resolveCategoryTemplate('1584');
  assert.ok(template, '1584 no debe producir category_template_not_found');
  assert.equal(template.templateId, 'cat-1584-v1');

  const productNode = template.buildProductNode(
    {
      sellerSku: '1584-SKU-1',
      name: 'Producto categoría 1584',
      primaryCategory: '1584',
      description: 'desc',
      brand: 'GENERICO',
      productId: '1584000001',
      productData: {
        Model: 'Modelo 1584',
        Material: 'Poliéster',
      },
      businessUnits: {
        OperatorCode: 'facl',
        Price: 19990,
        Stock: 3,
        Status: 'active',
      },
    } as any,
    '1584'
  );

  const xml = __testables.buildXmlRequest({ Product: productNode });
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
  const product = parsed?.Request?.Product;

  assert.equal(String(product?.PrimaryCategory), '1584');
  assert.equal(product?.ProductData?.Model, 'Modelo 1584');
  assert.equal(product?.BusinessUnits?.BusinessUnit?.OperatorCode, 'facl');
});

test('template 2493 carries TaxClass into the Seller Center XML', () => {
  const template = __testables.resolveCategoryTemplate('2493');
  assert.ok(template, '2493 must resolve to a registered category template');
  assert.equal(template.templateId, 'cat-2493-v1');

  const productNode = template.buildProductNode(
    {
      sellerSku: '2493-SKU-1',
      name: 'Balloon kit',
      primaryCategory: '2493',
      description: 'Party balloon kit',
      brand: 'GENERICO',
      taxClass: 'IVA 19%',
      productData: {
        Model: 'Katseye',
        Material: 'Látex',
      },
      businessUnits: {
        OperatorCode: 'facl',
        Price: 23990,
        Stock: 2,
        Status: 'active',
      },
    } as any,
    '2493'
  );

  const xml = __testables.buildXmlRequest({ Product: productNode });
  const product = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml)?.Request?.Product;

  assert.equal(String(product?.PrimaryCategory), '2493');
  assert.equal(product?.TaxClass, 'IVA 19%');
  assert.equal(product?.ProductData?.Model, 'Katseye');
  assert.equal(product?.BusinessUnits?.BusinessUnit?.OperatorCode, 'facl');
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
