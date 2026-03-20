import { getClient, type ApiClientOptions } from './client.js';
import type { Document, DocumentFile, PaginatedResponse } from '../types/api.js';

export interface CreateDocumentPayload {
  name?: string;
  subject?: string;
  message?: string;
  draft?: boolean;
  text_tags?: boolean;
  redirect_url?: string;
  signing_order?: boolean;
  test_mode?: boolean;
  expires_in?: number;
  reminders?: number[];
  files: DocumentFile[];
  recipients: Array<{
    id?: string;
    email: string;
    name?: string;
    embedded_signing?: boolean;
  }>;
}

export async function createDocument(
  payload: CreateDocumentPayload,
  options: ApiClientOptions = {},
): Promise<Document> {
  const client = getClient(options);
  const body = {
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
  params: { page?: number; per_page?: number; status?: string } = {},
  options: ApiClientOptions = {},
): Promise<PaginatedResponse<Document>> {
  const client = getClient(options);
  const { data } = await client.get('/documents', { params });

  // Normalize the response into our PaginatedResponse shape
  const documents = data.documents || data.data || data;
  const total = data.total_count || data.total || (Array.isArray(documents) ? documents.length : 0);
  const page = data.current_page || params.page || 1;
  const perPage = params.per_page || 20;
  const totalPages = data.total_pages || Math.ceil(total / perPage) || 1;

  return {
    data: Array.isArray(documents) ? documents : [],
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
  };
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
      embedded_signing?: boolean;
    }>;
    fields?: Array<{ name: string; value: string }>;
    subject?: string;
    message?: string;
    draft?: boolean;
    test_mode?: boolean;
  },
  options: ApiClientOptions = {},
): Promise<Document> {
  const client = getClient(options);
  const body = {
    ...payload,
    recipients: payload.recipients.map((r, i) => ({
      id: r.id || `recipient_${i + 1}`,
      ...r,
    })),
  };
  const { data } = await client.post<Document>('/document_templates/documents', body);
  return data;
}
