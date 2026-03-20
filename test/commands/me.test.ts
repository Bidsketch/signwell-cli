import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createApiClient, resetClient } from '../../src/api/client.js';
import { getMe } from '../../src/api/me.js';
import meFixture from '../fixtures/me.json';

const BASE_URL = 'https://www.signwell.com/api/v1';

beforeEach(() => {
  resetClient();
  process.env.SIGNWELL_API_KEY = 'test-api-key';
  process.env.SIGNWELL_API_BASE_URL = BASE_URL;
  createApiClient({ apiKey: 'test-api-key', baseUrl: BASE_URL, retries: 0 });
});

afterEach(() => {
  nock.cleanAll();
  resetClient();
  delete process.env.SIGNWELL_API_KEY;
  delete process.env.SIGNWELL_API_BASE_URL;
});

describe('me API', () => {
  it('fetches account info', async () => {
    nock(BASE_URL)
      .get('/me')
      .reply(200, meFixture);

    const me = await getMe();
    expect(me.name).toBe('Test User');
    expect(me.email).toBe('test@example.com');
    expect(me.plan).toBe('Business');
  });

  it('handles 401 error', async () => {
    nock(BASE_URL)
      .get('/me')
      .reply(401, { error: 'Invalid API key' });

    try {
      await getMe();
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.response?.status).toBe(401);
    }
  });
});
