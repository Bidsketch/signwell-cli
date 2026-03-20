import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createApiClient, resetClient } from '../../src/api/client.js';
import { getTemplate, listTemplates, deleteTemplate } from '../../src/api/templates.js';
import { createDocumentFromTemplate, sendDocument } from '../../src/api/documents.js';
import templateFixture from '../fixtures/template.json';
import documentFixture from '../fixtures/document.json';
import templatesListFixture from '../fixtures/templates-list.json';

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

describe('templates API', () => {
  it('gets a template by ID', async () => {
    nock(BASE_URL)
      .get('/document_templates/tmpl_abc123')
      .reply(200, templateFixture);

    const tmpl = await getTemplate('tmpl_abc123');
    expect(tmpl.id).toBe('tmpl_abc123');
    expect(tmpl.name).toBe('Standard NDA');
  });

  it('lists templates', async () => {
    nock(BASE_URL)
      .get('/document_templates')
      .query({ page: 1, per_page: 20 })
      .reply(200, templatesListFixture);

    const result = await listTemplates({ page: 1, per_page: 20 });
    expect(result.data).toHaveLength(2);
  });

  it('deletes a template', async () => {
    nock(BASE_URL)
      .delete('/document_templates/tmpl_abc123')
      .reply(204);

    await expect(deleteTemplate('tmpl_abc123')).resolves.not.toThrow();
  });

  it('creates document from template with draft:true when --send is used, then sends explicitly', async () => {
    const draftDoc = { ...documentFixture, status: 'draft', template_id: 'tmpl_abc123' };
    const sentDoc = { ...documentFixture, status: 'sent', template_id: 'tmpl_abc123' };

    // Step 1: create from template with draft: true
    const createScope = nock(BASE_URL)
      .post('/document_templates/documents', (body: any) => body.draft === true)
      .reply(201, draftDoc);

    // Step 2: explicit send call
    const sendScope = nock(BASE_URL)
      .post('/documents/doc_abc123/send')
      .reply(200, sentDoc);

    const doc = await createDocumentFromTemplate({
      template_ids: ['tmpl_abc123'],
      recipients: [{ placeholder_name: 'Signer', email: 'alice@example.com', name: 'Alice Smith' }],
      draft: true,
    });

    expect(doc.status).toBe('draft');
    expect(createScope.isDone()).toBe(true);

    const sent = await sendDocument(doc.id);
    expect(sent.status).toBe('sent');
    expect(sendScope.isDone()).toBe(true);
  });
});
