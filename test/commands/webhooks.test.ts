import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createApiClient, resetClient } from '../../src/api/client.js';
import { listWebhooks, createWebhook, deleteWebhook } from '../../src/api/webhooks.js';
import webhookFixture from '../fixtures/webhook.json';

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

describe('webhooks API', () => {
  it('lists webhooks', async () => {
    nock(BASE_URL)
      .get('/hooks')
      .reply(200, { hooks: [webhookFixture] });

    const webhooks = await listWebhooks();
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].id).toBe('hook_abc123');
  });

  it('creates a webhook', async () => {
    nock(BASE_URL)
      .post('/hooks')
      .reply(201, webhookFixture);

    const webhook = await createWebhook({
      url: 'https://myapp.com/webhooks/signwell',
      event_types: ['document_completed'],
    });
    expect(webhook.id).toBe('hook_abc123');
    expect(webhook.secret).toBe('whsec_test123');
  });

  it('deletes a webhook', async () => {
    nock(BASE_URL)
      .delete('/hooks/hook_abc123')
      .reply(204);

    await expect(deleteWebhook('hook_abc123')).resolves.not.toThrow();
  });
});
