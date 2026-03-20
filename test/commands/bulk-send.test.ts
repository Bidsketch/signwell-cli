import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createApiClient, resetClient } from '../../src/api/client.js';
import { getBulkSend, listBulkSends } from '../../src/api/bulk-send.js';
import bulkSendFixture from '../fixtures/bulk-send.json';

const BASE_URL = 'https://www.signwell.com/api/v1';

beforeEach(() => {
  resetClient();
  process.env.SIGNWELL_API_KEY = 'test-api-key';
  process.env.SIGNWELL_API_BASE_URL = BASE_URL;
  createApiClient({ apiKey: 'test-api-key', baseUrl: BASE_URL, testMode: true, retries: 0 });
});

afterEach(() => {
  nock.cleanAll();
  resetClient();
  delete process.env.SIGNWELL_API_KEY;
  delete process.env.SIGNWELL_API_BASE_URL;
});

describe('bulk-send API', () => {
  it('gets a bulk send by ID', async () => {
    nock(BASE_URL)
      .get('/bulk_sends/bs_abc123')
      .reply(200, bulkSendFixture);

    const bs = await getBulkSend('bs_abc123');
    expect(bs.id).toBe('bs_abc123');
    expect(bs.status).toBe('processing');
    expect(bs.total).toBe(50);
  });

  it('lists bulk sends', async () => {
    nock(BASE_URL)
      .get('/bulk_sends')
      .query({ page: 1, per_page: 20 })
      .reply(200, { bulk_sends: [bulkSendFixture], total: 1 });

    const result = await listBulkSends({ page: 1, per_page: 20 });
    expect(result.data).toHaveLength(1);
  });
});
