import test from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '../infrastructure/logger/logger';
import { apiKeyAuth } from '../interfaces/http/middlewares/apiKeyAuth';

const PRIMARY_KEY = 'test-primary-key-value';
const SECONDARY_KEY = 'test-secondary-key-value';
const WRONG_KEY = 'test-wrong-key-value';
const ALL_TEST_KEYS = [PRIMARY_KEY, SECONDARY_KEY, WRONG_KEY];

interface MockResponse {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
}

type LogLevel = 'warn' | 'error';

interface LogCall {
  level: LogLevel;
  args: unknown[];
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

interface MockRequest {
  headers: Record<string, string | string[]>;
  ip: string;
}

type RequestArg = Parameters<typeof apiKeyAuth>[0];
type ResponseArg = Parameters<typeof apiKeyAuth>[1];
type NextArg = Parameters<typeof apiKeyAuth>[2];

function createRequest(apiKey?: string | string[]): RequestArg {
  const headers: Record<string, string | string[]> = {};
  if (apiKey !== undefined) {
    headers['x-api-key'] = apiKey;
  }

  const request: MockRequest = { headers, ip: '127.0.0.1' };
  return request as unknown as RequestArg;
}

function setKeys(primary: string | undefined, secondary: string | undefined): void {
  if (primary === undefined) {
    delete process.env.API_KEY;
  } else {
    process.env.API_KEY = primary;
  }

  if (secondary === undefined) {
    delete process.env.API_KEY_SECONDARY;
  } else {
    process.env.API_KEY_SECONDARY = secondary;
  }
}

const savedPrimary = process.env.API_KEY;
const savedSecondary = process.env.API_KEY_SECONDARY;

test.afterEach(() => {
  if (savedPrimary === undefined) {
    delete process.env.API_KEY;
  } else {
    process.env.API_KEY = savedPrimary;
  }

  if (savedSecondary === undefined) {
    delete process.env.API_KEY_SECONDARY;
  } else {
    process.env.API_KEY_SECONDARY = savedSecondary;
  }
});

function spyLogger(): { calls: LogCall[]; restore: () => void } {
  const calls: LogCall[] = [];
  const originalWarn = logger.warn;
  const originalError = logger.error;

  const originalWarnRef = originalWarn.bind(logger);
  const originalErrorRef = originalError.bind(logger);

  (logger as unknown as Record<string, unknown>).warn = (...args: unknown[]) => {
    calls.push({ level: 'warn', args });
    return logger;
  };
  (logger as unknown as Record<string, unknown>).error = (...args: unknown[]) => {
    calls.push({ level: 'error', args });
    return logger;
  };

  return {
    calls,
    restore() {
      (logger as unknown as Record<string, unknown>).warn = originalWarnRef;
      (logger as unknown as Record<string, unknown>).error = originalErrorRef;
    }
  };
}

// Express types x-api-key as string | string[] (duplicate headers arrive as an
// array), so the harness accepts the same union the middleware does.
function invoke(apiKey: string | string[] | undefined): {
  res: MockResponse;
  nextCalls: number;
  calls: LogCall[];
} {
  const spy = spyLogger();
  const res = createMockResponse();
  let nextCalls = 0;

  try {
    const next: NextArg = () => {
      nextCalls += 1;
    };
    apiKeyAuth(createRequest(apiKey), res as unknown as ResponseArg, next);
  } finally {
    spy.restore();
  }

  return { res, nextCalls, calls: spy.calls };
}

function assertNoSecretMaterial(payload: unknown, calls: LogCall[]): void {
  const serialized = JSON.stringify({ payload, calls });
  for (const secret of ALL_TEST_KEYS) {
    assert.equal(
      serialized.includes(secret),
      false,
      'secret key material must never be emitted in responses or logs'
    );
  }
}

test('primary API_KEY authorizes a request', () => {
  setKeys(PRIMARY_KEY, SECONDARY_KEY);

  const { res, nextCalls, calls } = invoke(PRIMARY_KEY);

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.deepEqual(calls, []);
});

test('secondary API_KEY_SECONDARY authorizes during the rotation window', () => {
  setKeys(PRIMARY_KEY, SECONDARY_KEY);

  const { res, nextCalls, calls } = invoke(SECONDARY_KEY);

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
  assert.deepEqual(calls, []);
});

test('wrong API key is rejected with the existing 401 response', () => {
  setKeys(PRIMARY_KEY, SECONDARY_KEY);

  const { res, nextCalls, calls } = invoke(WRONG_KEY);

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'warn');
  assertNoSecretMaterial(res.body, calls);
});

test('wrong API key of a different length is rejected without throwing', () => {
  setKeys(PRIMARY_KEY, SECONDARY_KEY);

  const { res, nextCalls } = invoke('x');

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('missing x-api-key header is rejected with the existing 401 response', () => {
  setKeys(PRIMARY_KEY, SECONDARY_KEY);

  const { res, nextCalls, calls } = invoke(undefined);

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'warn');
});

test('multiple x-api-key header values are rejected with the exact 401 and leak nothing', () => {
  setKeys(PRIMARY_KEY, SECONDARY_KEY);

  const duplicateHeaderValues: string[][] = [
    [PRIMARY_KEY, PRIMARY_KEY],
    [PRIMARY_KEY, WRONG_KEY],
    [SECONDARY_KEY, SECONDARY_KEY],
    [SECONDARY_KEY, WRONG_KEY]
  ];

  for (const headerValue of duplicateHeaderValues) {
    const { res, nextCalls, calls } = invoke(headerValue);

    assert.equal(nextCalls, 0, 'a repeated header must never authorize');
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].level, 'warn');
    assertNoSecretMaterial(res.body, calls);
  }
});

test('missing primary API_KEY fails closed with 500 even when the secondary matches', () => {
  setKeys(undefined, SECONDARY_KEY);

  const { res, nextCalls, calls } = invoke(SECONDARY_KEY);

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Server misconfiguration' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'error');
  assertNoSecretMaterial(res.body, calls);
});

test('missing primary API_KEY fails closed with 500 when no secondary is configured', () => {
  setKeys(undefined, undefined);

  const { res, nextCalls } = invoke(PRIMARY_KEY);

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Server misconfiguration' });
});

test('retired secondary (unset) no longer authorizes', () => {
  setKeys(PRIMARY_KEY, undefined);

  const { res, nextCalls } = invoke(SECONDARY_KEY);

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('empty secondary value is treated as retired and no longer authorizes', () => {
  setKeys(PRIMARY_KEY, '');

  const { res, nextCalls } = invoke(SECONDARY_KEY);

  assert.equal(nextCalls, 0);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('primary API_KEY still authorizes after the secondary is retired', () => {
  setKeys(PRIMARY_KEY, undefined);

  const { res, nextCalls } = invoke(PRIMARY_KEY);

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});

test('no API key material is emitted in any response body or log entry', () => {
  const observations: Array<{ payload: unknown; calls: LogCall[] }> = [];

  for (const [primary, secondary, header] of [
    [PRIMARY_KEY, SECONDARY_KEY, WRONG_KEY],
    [undefined, SECONDARY_KEY, SECONDARY_KEY],
    [PRIMARY_KEY, undefined, SECONDARY_KEY]
  ] as Array<[string | undefined, string | undefined, string | undefined]>) {
    setKeys(primary, secondary);
    const { res, calls } = invoke(header);
    observations.push({ payload: res.body, calls });
  }

  for (const observation of observations) {
    assertNoSecretMaterial(observation.payload, observation.calls);
  }
});
