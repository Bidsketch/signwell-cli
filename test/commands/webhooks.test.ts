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
    expect(webhooks[0].callback_url).toBe('https://myapp.com/webhooks/signwell');
  });

  it('creates a webhook', async () => {
    const createScope = nock(BASE_URL)
      .post('/hooks', (body: any) =>
        body.callback_url === 'https://myapp.com/webhooks/signwell'
        && !('url' in body)
        && body.event_types?.[0] === 'document_completed',
      )
      .reply(201, webhookFixture);

    const webhook = await createWebhook({
      url: 'https://myapp.com/webhooks/signwell',
      event_types: ['document_completed'],
    });
    expect(webhook.id).toBe('hook_abc123');
    expect(webhook.callback_url).toBe('https://myapp.com/webhooks/signwell');
    expect(createScope.isDone()).toBe(true);
  });

  it('deletes a webhook', async () => {
    nock(BASE_URL)
      .delete('/hooks/hook_abc123')
      .reply(204);

    await expect(deleteWebhook('hook_abc123')).resolves.not.toThrow();
  });
});
