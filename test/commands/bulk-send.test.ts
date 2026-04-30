import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createApiClient, resetClient } from '../../src/api/client.js';
import { createBulkSend, getBulkSend, listBulkSends } from '../../src/api/bulk-send.js';
import bulkSendFixture from '../fixtures/bulk-send.json';

const BASE_URL = 'https://www.signwell.com/api/v1';
const tmpDir = path.join(os.tmpdir(), 'signwell-bulk-send-test-' + Date.now());

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  resetClient();
  process.env.SIGNWELL_API_KEY = 'test-api-key';
  process.env.SIGNWELL_API_BASE_URL = BASE_URL;
  createApiClient({ apiKey: 'test-api-key', baseUrl: BASE_URL, testMode: true, retries: 0 });
});

afterEach(() => {
  nock.cleanAll();
  fs.rmSync(tmpDir, { recursive: true, force: true });
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

  it('creates a bulk send with --limit applied to data rows only', async () => {
    const csvPath = path.join(tmpDir, 'batch.csv');
    fs.writeFileSync(csvPath, 'name,email\nAlice,alice@example.com\nBob,bob@example.com\n');

    nock(BASE_URL)
      .post('/bulk_sends', (body: any) => {
        const decoded = Buffer.from(body.bulk_send_csv, 'base64').toString('utf-8');
        return decoded === 'name,email\nAlice,alice@example.com';
      })
      .reply(201, bulkSendFixture);

    const result = await createBulkSend({
      template_ids: ['tmpl_abc123'],
      csv_file: csvPath,
      limit: 1,
    });

    expect(result.id).toBe('bs_abc123');
  });
});
