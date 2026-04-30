import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createApiClient, resetClient } from '../../src/api/client.js';
import { getDocument, listDocuments, createDocument, sendDocument, deleteDocument } from '../../src/api/documents.js';
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
      .query({ page: 1, per_page: 20 })
      .reply(200, documentsListFixture);

    const result = await listDocuments({ page: 1, per_page: 20 });
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it('retries once after a 429 rate limit response', async () => {
    resetClient();
    createApiClient({ apiKey: 'test-api-key', baseUrl: BASE_URL, testMode: true, retries: 1 });

    nock(BASE_URL)
      .get('/documents')
      .query({ page: 1, per_page: 20 })
      .reply(429, { error: 'rate limited' })
      .get('/documents')
      .query({ page: 1, per_page: 20 })
      .reply(200, documentsListFixture);

    const result = await listDocuments({ page: 1, per_page: 20 });
    expect(result.data).toHaveLength(2);
  });

  it('creates a document', async () => {
    nock(BASE_URL)
      .post('/documents')
      .reply(201, documentFixture);

    const doc = await createDocument({
      name: 'Service Agreement',
      files: [{ name: 'contract.pdf', file_base64: 'dGVzdA==' }],
      recipients: [{ email: 'alice@example.com', name: 'Alice Smith' }],
    });

    expect(doc.id).toBe('doc_abc123');
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

  it('creates a document with draft:true when --send is used, then sends explicitly', async () => {
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
