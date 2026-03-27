import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StockRepositorySellerCenter,
  SellerCenterGetStockError,
  SellerCenterUpdateStockError,
  SellerCenterFeedStatusError
} from '../infrastructure/sellercenter/stockRepositorySellerCenter';
import * as sellerCenterClient from '../infrastructure/sellercenter/sellerCenterClient';

const originalHttpGet = sellerCenterClient.httpGet;
const originalHttpPost = sellerCenterClient.httpPost;
const originalFacilityId = process.env.SC_GSC_FACILITY_ID;

test.afterEach(() => {
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet =
    originalHttpGet;
  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost =
    originalHttpPost;
  process.env.SC_GSC_FACILITY_ID = originalFacilityId;
});

test('StockRepositorySellerCenter maps SuccessResponse XML to JSON contract', async () => {
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet =
    async () => ({
      status: 200,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<SuccessResponse>
  <Body>
    <Stocks>
      <SellerWarehouses>
        <Warehouse>
          <SellerWarehouseId></SellerWarehouseId>
          <FacilityID>FAC-1</FacilityID>
          <SellerSku>1901928641</SellerSku>
          <Quantity>2</Quantity>
        </Warehouse>
        <Warehouse>
          <SellerWarehouseId>W-2</SellerWarehouseId>
          <FacilityID>FAC-2</FacilityID>
          <SellerSku>1901928641</SellerSku>
          <Quantity>3</Quantity>
        </Warehouse>
      </SellerWarehouses>
    </Stocks>
  </Body>
</SuccessResponse>`
    });

  const repository = new StockRepositorySellerCenter();
  const result = await repository.getStockBySku('1901928641');

  assert.equal(result.sku, '1901928641');
  assert.equal(result.totalQuantity, 5);
  assert.deepEqual(result.warehouses[0], {
    sellerWarehouseId: null,
    facilityId: 'FAC-1',
    sellerSku: '1901928641',
    quantity: 2
  });
});

test('StockRepositorySellerCenter maps ErrorResponse XML to SellerCenterGetStockError', async () => {
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet =
    async () => ({
      status: 200,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<ErrorResponse>
  <Head>
    <RequestAction>GetStock</RequestAction>
    <ErrorType>Sender</ErrorType>
    <ErrorCode>1001</ErrorCode>
    <ErrorMessage>Invalid Seller Sku List: 1901928642</ErrorMessage>
  </Head>
  <Body/>
</ErrorResponse>`
    });

  const repository = new StockRepositorySellerCenter();

  await assert.rejects(async () => repository.getStockBySku('1901928642'), (err: unknown) => {
    assert.ok(err instanceof SellerCenterGetStockError);
    assert.equal(err.errorCode, '1001');
    assert.equal(err.errorMessage, 'Invalid Seller Sku List: 1901928642');
    return true;
  });
});

test('StockRepositorySellerCenter throws when XML does not contain Stocks/Warehouse', async () => {
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet =
    async () => ({
      status: 200,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<SuccessResponse>
  <Body></Body>
</SuccessResponse>`
    });

  const repository = new StockRepositorySellerCenter();

  await assert.rejects(async () => repository.getStockBySku('1901928641'), {
    message: 'Stock not found in Seller Center GetStock response'
  });
});

test('StockRepositorySellerCenter maps UpdateStock SuccessResponse XML to effective JSON', async () => {
  process.env.SC_GSC_FACILITY_ID = 'GSC-SCBFD321E8A8D71';

  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost =
    async () => ({
      status: 200,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<SuccessResponse>
  <Head>
    <RequestAction>UpdateStock</RequestAction>
  </Head>
  <Body>
    <Stocks>
      <feed>1c41eff7-89ea-4ef4-b078-48421a90ca08</feed>
    </Stocks>
  </Body>
</SuccessResponse>`
    });

  const repository = new StockRepositorySellerCenter();
  const result = await repository.updateStock({
    sellerSku: '3516192124',
    quantity: 3
  });

  assert.deepEqual(result, {
    success: true,
    status: 'accepted',
    action: 'UpdateStock',
    sellerSku: '3516192124',
    quantity: 3,
    facilityId: 'GSC-SCBFD321E8A8D71',
    feedId: '1c41eff7-89ea-4ef4-b078-48421a90ca08'
  });
});

test('StockRepositorySellerCenter maps UpdateStock ErrorResponse XML to typed error', async () => {
  process.env.SC_GSC_FACILITY_ID = 'GSC-SCBFD321E8A8D71';

  (sellerCenterClient as unknown as { httpPost: typeof sellerCenterClient.httpPost }).httpPost =
    async () => ({
      status: 200,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<ErrorResponse>
  <Head>
    <RequestAction>UpdateStock</RequestAction>
    <ErrorType>Sender</ErrorType>
    <ErrorCode>1001</ErrorCode>
    <ErrorMessage>Invalid Seller Sku List: 3516192124</ErrorMessage>
  </Head>
  <Body/>
</ErrorResponse>`
    });

  const repository = new StockRepositorySellerCenter();

  await assert.rejects(
    async () => repository.updateStock({ sellerSku: '3516192124', quantity: 3 }),
    (err: unknown) => {
      assert.ok(err instanceof SellerCenterUpdateStockError);
      assert.equal(err.errorCode, '1001');
      assert.equal(err.errorMessage, 'Invalid Seller Sku List: 3516192124');
      return true;
    }
  );
});

test('StockRepositorySellerCenter maps FeedStatus SuccessResponse XML to effective JSON', async () => {
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet =
    async () => ({
      status: 200,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<SuccessResponse>
  <Body>
    <FeedDetail>
      <Feed>90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c</Feed>
      <Status>Finished</Status>
      <Action>ProductStockUpdate</Action>
      <CreationDate>2026-03-26 23:35:38</CreationDate>
      <UpdatedDate>2026-03-26 23:35:39</UpdatedDate>
      <Source>api</Source>
      <TotalRecords>1</TotalRecords>
      <ProcessedRecords>1</ProcessedRecords>
      <FailedRecords>0</FailedRecords>
    </FeedDetail>
  </Body>
</SuccessResponse>`
    });

  const repository = new StockRepositorySellerCenter();
  const result = await repository.getFeedStatus('90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c');

  assert.deepEqual(result, {
    success: true,
    feedId: '90ffc2f7-99d4-4fb2-b7d4-bfe8e5f7c34c',
    status: 'Finished',
    action: 'ProductStockUpdate',
    creationDate: '2026-03-26 23:35:38',
    updatedDate: '2026-03-26 23:35:39',
    source: 'api',
    totalRecords: 1,
    processedRecords: 1,
    failedRecords: 0
  });
});

test('StockRepositorySellerCenter maps FeedStatus ErrorResponse XML to typed error', async () => {
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet =
    async () => ({
      status: 200,
      body: `<?xml version="1.0" encoding="UTF-8"?>
<ErrorResponse>
  <Head>
    <RequestAction>FeedStatus</RequestAction>
    <ErrorType>Sender</ErrorType>
    <ErrorCode>4040</ErrorCode>
    <ErrorMessage>Feed not found</ErrorMessage>
  </Head>
  <Body/>
</ErrorResponse>`
    });

  const repository = new StockRepositorySellerCenter();

  await assert.rejects(
    async () => repository.getFeedStatus('not-found-feed'),
    (err: unknown) => {
      assert.ok(err instanceof SellerCenterFeedStatusError);
      assert.equal(err.errorCode, '4040');
      assert.equal(err.errorMessage, 'Feed not found');
      return true;
    }
  );
});
