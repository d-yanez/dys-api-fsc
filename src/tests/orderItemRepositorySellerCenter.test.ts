import test from 'node:test';
import assert from 'node:assert/strict';
import { OrderItemRepositorySellerCenter } from '../infrastructure/sellercenter/orderItemRepositorySellerCenter';
import * as sellerCenterClient from '../infrastructure/sellercenter/sellerCenterClient';
import { logger } from '../infrastructure/logger/logger';

const originalHttpGet = sellerCenterClient.httpGet;
const originalLoggerError = logger.error;

test.afterEach(() => {
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet = originalHttpGet;
  logger.error = originalLoggerError;
});

test('OrderItemRepositorySellerCenter forwards the bounded lookup options and normalizes processability', async () => {
  let receivedOptions: { signal?: AbortSignal; timeoutMs?: number } | undefined;
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet = async (_url, options) => {
    receivedOptions = options;
    return {
      status: 200,
      body: JSON.stringify({
        SuccessResponse: {
          Body: {
            OrderItems: {
              OrderItem: [
                { OrderItemId: '1', OrderId: '10', IsProcessable: true },
                { OrderItemId: '2', OrderId: '10', IsProcessable: '0' },
                { OrderItemId: '3', OrderId: '10', IsProcessable: 'unexpected' },
              ],
            },
          },
        },
      }),
    };
  };
  const abort = new AbortController();

  const items = await new OrderItemRepositorySellerCenter().getOrderItemsByOrderId('10', {
    signal: abort.signal,
    timeoutMs: 1_500,
  });

  assert.equal(receivedOptions?.signal, abort.signal);
  assert.equal(receivedOptions?.timeoutMs, 1_500);
  assert.deepEqual(items.map((item) => item.isProcessable), [true, false, null]);
});

test('OrderItemRepositorySellerCenter does not log a raw provider body on lookup failure', async () => {
  const sensitiveBody = 'customer-and-order-sensitive-provider-body';
  let loggedContext: Record<string, unknown> | null = null;
  logger.error = ((context: Record<string, unknown>) => {
    loggedContext = context;
  }) as typeof logger.error;
  (sellerCenterClient as unknown as { httpGet: typeof sellerCenterClient.httpGet }).httpGet = async () => ({
    status: 404,
    body: sensitiveBody,
  });

  await assert.rejects(
    () => new OrderItemRepositorySellerCenter().getOrderItemsByOrderId('10'),
    /SellerCenter GetOrderItems HTTP 404/
  );

  assert.deepEqual(loggedContext, { status: 404 });
  assert.equal(JSON.stringify(loggedContext).includes(sensitiveBody), false);
});
