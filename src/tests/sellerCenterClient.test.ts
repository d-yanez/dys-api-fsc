import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { httpGet, httpPost } from '../infrastructure/sellercenter/sellerCenterClient';

const originalRequest = https.request;
const originalGet = https.get;

test.afterEach(() => {
  https.request = originalRequest;
  https.get = originalGet;
});

test('httpGet aborts a hung diagnostic lookup after the absolute timeout', async () => {
  class HungRequest extends EventEmitter {
    destroy(error: Error) {
      this.emit('error', error);
      this.emit('close');
      return this;
    }
  }

  const request = new HungRequest();
  https.get = (() => request) as unknown as typeof https.get;

  const startedAt = Date.now();
  await assert.rejects(
    () => httpGet('https://sellercenter.test/?Action=GetOrderItems', { timeoutMs: 20 }),
    (error: unknown) => error instanceof Error && error.name === 'SellerCenterRequestTimeoutError'
  );
  assert.ok(Date.now() - startedAt < 500);
});

test('httpPost aborts a hung upstream after the absolute timeout', async () => {
  class HungRequest extends EventEmitter {
    write() {}
    end() {}
    destroy(error: Error) {
      this.emit('error', error);
      this.emit('close');
      return this;
    }
  }

  const request = new HungRequest();
  https.request = (() => request) as unknown as typeof https.request;

  const startedAt = Date.now();
  await assert.rejects(
    () => httpPost('https://sellercenter.test/upload', '{}', undefined, { timeoutMs: 20 }),
    (error: unknown) => error instanceof Error && error.name === 'SellerCenterRequestTimeoutError'
  );
  assert.ok(Date.now() - startedAt < 500);
});
