import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createApiClient, resetClient } from '../../src/api/client.js';
import { getTemplate, listTemplates, deleteTemplate } from '../../src/api/templates.js';
import { createDocumentFromTemplate, sendDocument } from '../../src/api/documents.js';
import { buildTemplateListPageParams, buildTemplateListParams, buildTemplateListQuery } from '../../src/commands/templates.js';
import { UsageError } from '../../src/lib/errors.js';
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
      .query({ page: 1, limit: 20 })
      .reply(200, templatesListFixture);

    const result = await listTemplates({ page: 1, per_page: 20 });
    expect(result.data).toHaveLength(2);
  });

  it('maps per_page pagination input to API limit', async () => {
    nock(BASE_URL)
      .get('/document_templates')
      .query({ page: 1, limit: 100 })
      .reply(200, templatesListFixture);

    const result = await listTemplates({ page: 1, per_page: 100 });
    expect(result.per_page).toBe(100);
  });

  it('maps limit pagination input to API limit', async () => {
    nock(BASE_URL)
      .get('/document_templates')
      .query({ page: 1, limit: 100 })
      .reply(200, templatesListFixture);

    const result = await listTemplates({ page: 1, limit: 100 });
    expect(result.per_page).toBe(100);
  });

  it('passes raw query filters to the templates API', async () => {
    const query = 'name:Classic AND status:Available AND start_date:2026-01-31';

    nock(BASE_URL)
      .get('/document_templates')
      .query({ page: 2, limit: 30, query })
      .reply(200, templatesListFixture);

    const result = await listTemplates({ page: 2, per_page: 30, query });
    expect(result.per_page).toBe(30);
  });

  it('sends only supported top-level template list params', async () => {
    const query = 'status:Available';

    nock(BASE_URL)
      .get('/document_templates')
      .query((params) => {
        expect(params).toEqual({ page: '2', limit: '30', query });
        return true;
      })
      .reply(200, templatesListFixture);

    const result = await listTemplates({
      page: 2,
      limit: 30,
      per_page: 50,
      query,
      status: 'Available',
    } as any);
    expect(result.per_page).toBe(30);
  });

  it('builds status filters into template query syntax', () => {
    expect(buildTemplateListQuery({ status: 'Available' })).toBe('status:Available');
  });

  it('builds raw and named template filters into query syntax', () => {
    expect(buildTemplateListQuery({
      query: 'name:Classic',
      name: 'standard-nda',
      status: 'Available',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      templateIds: ['tmpl_1,tmpl_2', 'tmpl_3'],
    })).toBe(
      'name:Classic AND name:standard-nda AND status:Available AND start_date:2026-02-01 AND end_date:2026-02-28 AND template_ids:tmpl_1,tmpl_2,tmpl_3',
    );
  });

  it('builds template filters from snake_case option aliases', () => {
    expect(buildTemplateListQuery({
      start_date: '2026-02-01',
      end_date: '2026-02-28',
      template_ids: ['tmpl_1', 'tmpl_2'],
    })).toBe('start_date:2026-02-01 AND end_date:2026-02-28 AND template_ids:tmpl_1,tmpl_2');
  });

  it('builds template list params from CLI pagination aliases and filters', () => {
    expect(buildTemplateListParams({
      page: 2,
      perPage: 50,
      status: 'Available',
    })).toEqual({
      page: 2,
      limit: 50,
      query: 'status:Available',
    });
  });

  it('prefers limit over per-page aliases for templates', () => {
    expect(buildTemplateListParams({
      page: 2,
      limit: 30,
      perPage: 50,
      per_page: 40,
    })).toEqual({
      page: 2,
      limit: 30,
      query: undefined,
    });
  });

  it('builds all-page template list params with the current query and page size', () => {
    expect(buildTemplateListPageParams('name:Codex AND status:Available', 3, 100)).toEqual({
      page: 3,
      limit: 100,
      query: 'name:Codex AND status:Available',
    });
  });

  it('rejects invalid template date filters', () => {
    expect(() => buildTemplateListQuery({ startDate: '02/15/2026' })).toThrow(UsageError);
  });

  it('rejects raw OR filters for templates', () => {
    expect(() => buildTemplateListQuery({ query: 'name:Codex OR status:Available' })).toThrow(UsageError);
  });

  it('rejects invalid template list limits', () => {
    expect(() => buildTemplateListParams({ limit: 0 })).toThrow(UsageError);
  });

  it('deletes a template', async () => {
    nock(BASE_URL)
      .delete('/document_templates/tmpl_abc123')
      .reply(204);

    await expect(deleteTemplate('tmpl_abc123')).resolves.not.toThrow();
  });

  it('creates document from template as draft by default', async () => {
    const draftDoc = { ...documentFixture, status: 'draft', template_id: 'tmpl_abc123' };

    const createScope = nock(BASE_URL)
      .post('/document_templates/documents', (body: any) => body.draft === true)
      .reply(201, draftDoc);

    const doc = await createDocumentFromTemplate({
      template_ids: ['tmpl_abc123'],
      recipients: [{ placeholder_name: 'Signer', email: 'alice@example.com', name: 'Alice Smith' }],
    });

    expect(doc.status).toBe('draft');
    expect(createScope.isDone()).toBe(true);
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
