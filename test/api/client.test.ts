import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createApiClient, resetClient } from '../../src/api/client.js';

const BASE_URL = 'https://www.signwell.com/api/v1';

beforeEach(() => {
  resetClient();
  process.env.SIGNWELL_API_KEY = 'test-api-key';
  process.env.SIGNWELL_API_BASE_URL = BASE_URL;
});

afterEach(() => {
  nock.cleanAll();
  resetClient();
  delete process.env.SIGNWELL_API_KEY;
  delete process.env.SIGNWELL_API_BASE_URL;
  delete process.env.SIGNWELL_TEST_MODE;
});

describe('api client', () => {
  it('honors SIGNWELL_TEST_MODE=true even when testMode option is false', async () => {
    process.env.SIGNWELL_TEST_MODE = 'true';

    const scope = nock(BASE_URL)
      .post('/documents', (body: any) =>
        body.name === 'Service Agreement' && body.test_mode === true,
      )
      .reply(200, { ok: true });

    const client = createApiClient({
      apiKey: 'test-api-key',
      baseUrl: BASE_URL,
      testMode: false,
      retries: 0,
    });

    await client.post('/documents', { name: 'Service Agreement' });

    expect(scope.isDone()).toBe(true);
  });
});
