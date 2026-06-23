import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createApiClient, resetClient } from '../../src/api/client.js';
import { getDocument, listDocuments, createDocument, sendDocument, deleteDocument } from '../../src/api/documents.js';
import {
  buildDocumentListPageParams,
  buildDocumentListParams,
  buildDocumentListQuery,
  ensureDocumentCreateCanSend,
  parseDocumentFieldsJson,
  validateDocumentFields,
} from '../../src/commands/documents.js';
import { UsageError } from '../../src/lib/errors.js';
import documentFixture from '../fixtures/document.json';
import documentsListFixture from '../fixtures/documents-list.json';

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

describe('documents API', () => {
  it('gets a document by ID', async () => {
    nock(BASE_URL)
      .get('/documents/doc_abc123')
      .reply(200, documentFixture);

    const doc = await getDocument('doc_abc123');
    expect(doc.id).toBe('doc_abc123');
    expect(doc.name).toBe('Service Agreement');
    expect(doc.status).toBe('pending');
    expect(doc.recipients).toHaveLength(1);
  });

  it('lists documents', async () => {
    nock(BASE_URL)
      .get('/documents')
      .query({ page: 1, limit: 20 })
      .reply(200, documentsListFixture);

    const result = await listDocuments({ page: 1, per_page: 20 });
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('maps per_page pagination input to API limit', async () => {
    nock(BASE_URL)
      .get('/documents')
      .query({ page: 1, limit: 100 })
      .reply(200, documentsListFixture);

    const result = await listDocuments({ page: 1, per_page: 100 });
    expect(result.per_page).toBe(100);
  });

  it('maps limit pagination input to API limit', async () => {
    nock(BASE_URL)
      .get('/documents')
      .query({ page: 1, limit: 100 })
      .reply(200, documentsListFixture);

    const result = await listDocuments({ page: 1, limit: 100 });
    expect(result.per_page).toBe(100);
  });

  it('retries once after a 429 rate limit response', async () => {
    resetClient();
    createApiClient({ apiKey: 'test-api-key', baseUrl: BASE_URL, testMode: true, retries: 1 });

    nock(BASE_URL)
      .get('/documents')
      .query({ page: 1, limit: 20 })
      .reply(429, { error: 'rate limited' })
      .get('/documents')
      .query({ page: 1, limit: 20 })
      .reply(200, documentsListFixture);

    const result = await listDocuments({ page: 1, per_page: 20 });
    expect(result.data).toHaveLength(2);
  });

  it('passes raw query filters to the documents API', async () => {
    const query = 'name:Classic AND status:completed AND start_date:2026-01-31';

    nock(BASE_URL)
      .get('/documents')
      .query({ page: 2, limit: 30, query })
      .reply(200, documentsListFixture);

    const result = await listDocuments({ page: 2, limit: 30, query });
    expect(result.per_page).toBe(30);
  });

  it('sends only supported top-level document list params', async () => {
    const query = 'status:completed';

    nock(BASE_URL)
      .get('/documents')
      .query((params) => {
        expect(params).toEqual({ page: '2', limit: '30', query });
        return true;
      })
      .reply(200, documentsListFixture);

    const result = await listDocuments({
      page: 2,
      limit: 30,
      per_page: 50,
      query,
      status: 'completed',
    } as any);
    expect(result.per_page).toBe(30);
  });

  it('builds status filters into query syntax', () => {
    expect(buildDocumentListQuery({ status: 'completed' })).toBe('status:completed');
  });

  it('builds raw and named filters into query syntax', () => {
    expect(buildDocumentListQuery({
      query: 'name:Classic',
      name: 'small-contract',
      person: 'alice@example.com',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      documentIds: ['doc_1,doc_2', 'doc_3'],
    })).toBe(
      'name:Classic AND name:small-contract AND person:alice@example.com AND start_date:2026-02-01 AND end_date:2026-02-28 AND document_ids:doc_1,doc_2,doc_3',
    );
  });

  it('builds list params from CLI pagination aliases and filters', () => {
    expect(buildDocumentListParams({
      page: 2,
      perPage: 50,
      status: 'pending',
    })).toEqual({
      page: 2,
      limit: 50,
      query: 'status:pending',
    });
  });

  it('builds all-page list params with the current query and page size', () => {
    expect(buildDocumentListPageParams('name:Codex AND status:draft', 3, 50)).toEqual({
      page: 3,
      limit: 50,
      query: 'name:Codex AND status:draft',
    });
  });

  it('rejects invalid date filters', () => {
    expect(() => buildDocumentListQuery({ startDate: '02/15/2026' })).toThrow(UsageError);
  });

  it('rejects raw OR filters', () => {
    expect(() => buildDocumentListQuery({ query: 'name:Codex OR status:draft' })).toThrow(UsageError);
  });

  it('rejects document list limits outside the API range', () => {
    expect(() => buildDocumentListParams({ limit: 100 })).toThrow(UsageError);
  });

  it('creates a document', async () => {
    const createScope = nock(BASE_URL)
      .post('/documents', (body: any) => body.draft === true)
      .reply(201, documentFixture);

    const doc = await createDocument({
      name: 'Service Agreement',
      files: [{ name: 'contract.pdf', file_base64: 'dGVzdA==' }],
      recipients: [{ email: 'alice@example.com', name: 'Alice Smith' }],
    });

    expect(doc.id).toBe('doc_abc123');
    expect(createScope.isDone()).toBe(true);
  });

  it('creates and sends a document in one request when draft is false and fields are supplied', async () => {
    const fields = [[{
      x: 346.67,
      y: 549.33,
      page: 1,
      recipient_id: '1',
      type: 'signature',
      required: true,
      api_id: 'Signature_1',
      width: 293.33,
      height: 66.67,
    }]];

    const createScope = nock(BASE_URL)
      .post('/documents', (body: any) => {
        expect(body.draft).toBe(false);
        expect(body.fields).toEqual(fields);
        expect(body.recipients[0].id).toBe('1');
        return true;
      })
      .reply(201, { ...documentFixture, status: 'sent' });

    const doc = await createDocument({
      name: 'Service Agreement',
      files: [{ name: 'contract.pdf', file_base64: 'dGVzdA==' }],
      recipients: [{ email: 'alice@example.com', name: 'Alice Smith' }],
      draft: false,
      fields,
    });

    expect(doc.status).toBe('sent');
    expect(createScope.isDone()).toBe(true);
  });

  it('creates and sends a text-tagged document in one request when draft is false', async () => {
    const createScope = nock(BASE_URL)
      .post('/documents', (body: any) => body.draft === false && body.text_tags === true)
      .reply(201, { ...documentFixture, status: 'sent' });

    const doc = await createDocument({
      name: 'Tagged Service Agreement',
      files: [{ name: 'contract.pdf', file_base64: 'dGVzdA==' }],
      recipients: [{ email: 'alice@example.com', name: 'Alice Smith' }],
      draft: false,
      text_tags: true,
    });

    expect(doc.status).toBe('sent');
    expect(createScope.isDone()).toBe(true);
  });

  it('sends a document', async () => {
    nock(BASE_URL)
      .post('/documents/doc_abc123/send')
      .reply(200, { ...documentFixture, status: 'sent' });

    const doc = await sendDocument('doc_abc123');
    expect(doc.status).toBe('sent');
  });

  it('deletes a document', async () => {
    nock(BASE_URL)
      .delete('/documents/doc_abc123')
      .reply(204);

    await expect(deleteDocument('doc_abc123')).resolves.not.toThrow();
  });

  it('can create a draft and send it explicitly', async () => {
    const draftDoc = { ...documentFixture, status: 'draft' };
    const sentDoc = { ...documentFixture, status: 'sent' };

    // Step 1: create with draft: true
    const createScope = nock(BASE_URL)
      .post('/documents', (body: any) => body.draft === true)
      .reply(201, draftDoc);

    // Step 2: explicit send call
    const sendScope = nock(BASE_URL)
      .post('/documents/doc_abc123/send')
      .reply(200, sentDoc);

    const doc = await createDocument({
      name: 'Service Agreement',
      files: [{ name: 'contract.pdf', file_base64: 'dGVzdA==' }],
      recipients: [{ email: 'alice@example.com', name: 'Alice Smith' }],
      draft: true,
    });

    expect(doc.status).toBe('draft');
    expect(createScope.isDone()).toBe(true);

    const sent = await sendDocument(doc.id);
    expect(sent.status).toBe('sent');
    expect(sendScope.isDone()).toBe(true);
  });

  it('handles 404 error', async () => {
    nock(BASE_URL)
      .get('/documents/nonexistent')
      .reply(404, { error: 'Not found' });

    try {
      await getDocument('nonexistent');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.response?.status).toBe(404);
    }
  });
});

describe('document field validation', () => {
  const validField = {
    x: 346.67,
    y: 549.33,
    page: 1,
    recipient_id: '1',
    type: 'signature',
    required: true,
  };

  it('accepts a two-dimensional fields array with one entry per file', () => {
    expect(validateDocumentFields([[validField]], 1)).toEqual([[validField]]);
  });

  it('rejects non-two-dimensional fields JSON', () => {
    expect(() => validateDocumentFields([validField], 1)).toThrow(UsageError);
    expect(() => parseDocumentFieldsJson('{"x":260}', 1)).toThrow(UsageError);
  });

  it('rejects fields arrays that do not match the uploaded file count', () => {
    expect(() => validateDocumentFields([[validField]], 2)).toThrow(UsageError);
  });

  it('rejects fields missing required keys', () => {
    expect(() => validateDocumentFields([[
      { x: 346.67, y: 549.33, page: 1, recipient_id: '1' },
    ]], 1)).toThrow(UsageError);
  });

  it('rejects invalid required field value types', () => {
    expect(() => validateDocumentFields([[
      { ...validField, x: '260' },
    ]], 1)).toThrow(UsageError);
    expect(() => validateDocumentFields([[
      { ...validField, page: 0 },
    ]], 1)).toThrow(UsageError);
  });

  it('rejects send without text tags or non-empty fields', () => {
    expect(() => ensureDocumentCreateCanSend(true, false, undefined)).toThrow(UsageError);
    expect(() => ensureDocumentCreateCanSend(true, false, [[]])).toThrow(UsageError);
  });

  it('allows send with text tags or non-empty coordinate fields', () => {
    expect(() => ensureDocumentCreateCanSend(true, true, undefined)).not.toThrow();
    expect(() => ensureDocumentCreateCanSend(true, false, [[validField]])).not.toThrow();
  });
});
