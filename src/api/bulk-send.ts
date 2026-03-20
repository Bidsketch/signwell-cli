import fs from 'node:fs';
import { getClient, type ApiClientOptions } from './client.js';
import type { BulkSend, Document, PaginatedResponse } from '../types/api.js';
import { FileError } from '../lib/errors.js';

export async function createBulkSend(
  payload: {
    template_ids: string[];
    name?: string;
    csv_file: string; // path to CSV file
    test_mode?: boolean;
  },
  options: ApiClientOptions = {},
): Promise<BulkSend> {
  const client = getClient(options);

  if (!fs.existsSync(payload.csv_file)) {
    throw new FileError(`CSV file not found: ${payload.csv_file}`);
  }

  const csvContent = fs.readFileSync(payload.csv_file, 'utf-8');

  const csvBase64 = Buffer.from(csvContent).toString('base64');

  const { data } = await client.post<BulkSend>('/bulk_sends', {
    template_ids: payload.template_ids,
    name: payload.name,
    bulk_send_csv: csvBase64,
    test_mode: payload.test_mode,
  });
  return data;
}

export async function getBulkSend(id: string, options: ApiClientOptions = {}): Promise<BulkSend> {
  const client = getClient(options);
  const { data } = await client.get<BulkSend>(`/bulk_sends/${id}`);
  return data;
}

export async function listBulkSends(
  params: { page?: number; per_page?: number } = {},
  options: ApiClientOptions = {},
): Promise<PaginatedResponse<BulkSend>> {
  const client = getClient(options);
  const { data } = await client.get('/bulk_sends', { params });

  const bulkSends = data.bulk_sends || data.data || data;
  const total = data.total_count || data.total || (Array.isArray(bulkSends) ? bulkSends.length : 0);
  const page = data.current_page || params.page || 1;
  const perPage = params.per_page || 20;
  const totalPages = data.total_pages || Math.ceil(total / perPage) || 1;

  return {
    data: Array.isArray(bulkSends) ? bulkSends : [],
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
  };
}

export async function listBulkSendDocuments(
  id: string,
  params: { page?: number; per_page?: number } = {},
  options: ApiClientOptions = {},
): Promise<PaginatedResponse<Document>> {
  const client = getClient(options);
  const { data } = await client.get(`/bulk_sends/${id}/documents`, { params });

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

export async function getCsvTemplate(
  templateIds: string[],
  options: ApiClientOptions = {},
): Promise<string> {
  const client = getClient(options);
  const params = new URLSearchParams();
  templateIds.forEach((id) => params.append('template_ids[]', id));

  const { data } = await client.get(`/bulk_sends/csv_template?${params.toString()}`);
  return typeof data === 'string' ? data : JSON.stringify(data);
}

export async function validateCsv(
  payload: { template_ids: string[]; csv_file: string },
  options: ApiClientOptions = {},
): Promise<unknown> {
  const client = getClient(options);

  if (!fs.existsSync(payload.csv_file)) {
    throw new FileError(`CSV file not found: ${payload.csv_file}`);
  }

  const csvContent = fs.readFileSync(payload.csv_file, 'utf-8');

  const csvBase64 = Buffer.from(csvContent).toString('base64');

  const { data } = await client.post('/bulk_sends/validate_csv', {
    template_ids: payload.template_ids,
    bulk_send_csv: csvBase64,
  });
  return data;
}
