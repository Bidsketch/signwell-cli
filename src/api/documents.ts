import { getClient, type ApiClientOptions } from './client.js';
import type { Document, DocumentFile, PaginatedResponse } from '../types/api.js';
import { normalizePaginatedResponse, type PaginationParams } from '../lib/pagination.js';

export interface DocumentField {
  x: number;
  y: number;
  page: number;
  recipient_id: string;
  type: string;
  [key: string]: unknown;
}

export type DocumentFields = DocumentField[][];

export interface CreateDocumentPayload {
  name?: string;
  subject?: string;
  message?: string;
  draft?: boolean;
  text_tags?: boolean;
  redirect_url?: string;
  apply_signing_order?: boolean;
  embedded_signing?: boolean;
  test_mode?: boolean;
  expires_in?: number;
  reminders?: number[];
  fields?: DocumentFields;
  files: DocumentFile[];
  recipients: Array<{
    id?: string;
    email: string;
    name?: string;
    signing_order?: number;
  }>;
}

export interface DocumentListParams extends PaginationParams {
  query?: string;
}

export async function createDocument(
  payload: CreateDocumentPayload,
  options: ApiClientOptions = {},
): Promise<Document> {
  const client = getClient(options);
  const body = {
    draft: true,
    ...payload,
    recipients: payload.recipients.map((r, i) => ({
      id: r.id || String(i + 1),
      ...r,
    })),
  };
  const { data } = await client.post<Document>('/documents', body);
  return data;
}

export async function getDocument(id: string, options: ApiClientOptions = {}): Promise<Document> {
  const client = getClient(options);
  const { data } = await client.get<Document>(`/documents/${id}`);
  return data;
}

export async function listDocuments(
  params: DocumentListParams = {},
  options: ApiClientOptions = {},
): Promise<PaginatedResponse<Document>> {
  const client = getClient(options);
  const pageSize = params.limit ?? params.per_page;
  const apiParams = {
    ...(params.page !== undefined ? { page: params.page } : {}),
    ...(pageSize !== undefined ? { limit: pageSize } : {}),
    ...(params.query !== undefined ? { query: params.query } : {}),
  };
  const { data } = await client.get('/documents', { params: apiParams });
  return normalizePaginatedResponse<Document>(data, ['documents'], apiParams);
}

export async function sendDocument(id: string, options: ApiClientOptions = {}): Promise<Document> {
  const client = getClient(options);
  const { data } = await client.post<Document>(`/documents/${id}/send`);
  return data;
}

export async function remindDocument(id: string, options: ApiClientOptions = {}): Promise<void> {
  const client = getClient(options);
  await client.post(`/documents/${id}/remind`);
}

export async function downloadDocument(
  id: string,
  options: ApiClientOptions = {},
): Promise<Buffer> {
  const client = getClient(options);
  const { data } = await client.get(`/documents/${id}/completed_pdf`, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });
  return Buffer.from(data);
}

export async function deleteDocument(id: string, options: ApiClientOptions = {}): Promise<void> {
  const client = getClient(options);
  await client.delete(`/documents/${id}`);
}

export async function updateRecipients(
  id: string,
  recipients: Array<{ old_email: string; new_email: string; new_name?: string }>,
  options: ApiClientOptions = {},
): Promise<Document> {
  const client = getClient(options);
  const { data } = await client.patch<Document>(`/documents/${id}/recipients`, { recipients });
  return data;
}

export async function createDocumentFromTemplate(
  payload: {
    template_ids: string[];
    recipients: Array<{
      id?: string;
      placeholder_name?: string;
      email: string;
      name?: string;
      signing_order?: number;
    }>;
    template_fields?: Array<{ api_id: string; value: string }>;
    subject?: string;
    message?: string;
    draft?: boolean;
    embedded_signing?: boolean;
    apply_signing_order?: boolean;
    test_mode?: boolean;
  },
  options: ApiClientOptions = {},
): Promise<Document> {
  const client = getClient(options);
  const body = {
    draft: true,
    ...payload,
    recipients: payload.recipients.map((r, i) => ({
      id: r.id || `recipient_${i + 1}`,
      ...r,
    })),
  };
  const { data } = await client.post<Document>('/document_templates/documents', body);
  return data;
}
