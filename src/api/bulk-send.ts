import fs from 'node:fs';
import { getClient, type ApiClientOptions } from './client.js';
import type { BulkSend, Document, PaginatedResponse } from '../types/api.js';
import { FileError } from '../lib/errors.js';
import { normalizePaginatedResponse } from '../lib/pagination.js';
import { readCsvForUpload } from '../lib/csv.js';

export async function createBulkSend(
  payload: {
    template_ids: string[];
    name?: string;
    csv_file: string; // path to CSV file
    limit?: number;
    test_mode?: boolean;
  },
  options: ApiClientOptions = {},
): Promise<BulkSend> {
  const client = getClient(options);

  if (!fs.existsSync(payload.csv_file)) {
    throw new FileError(`CSV file not found: ${payload.csv_file}`);
  }

  const csv = readCsvForUpload(payload.csv_file, payload.limit);
  const csvBase64 = Buffer.from(csv.content).toString('base64');

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
  params: { page?: number; limit?: number } = {},
  options: ApiClientOptions = {},
): Promise<PaginatedResponse<BulkSend>> {
  const client = getClient(options);
  const { data } = await client.get('/bulk_sends', { params });
  return normalizePaginatedResponse<BulkSend>(data, ['bulk_sends'], params);
}

export async function listBulkSendDocuments(
  id: string,
  params: { page?: number; limit?: number } = {},
  options: ApiClientOptions = {},
): Promise<PaginatedResponse<Document>> {
  const client = getClient(options);
  const { data } = await client.get(`/bulk_sends/${id}/documents`, { params });
  return normalizePaginatedResponse<Document>(data, ['documents'], params);
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

  const csv = readCsvForUpload(payload.csv_file);
  const csvBase64 = Buffer.from(csv.content).toString('base64');

  const { data } = await client.post('/bulk_sends/validate_csv', {
    template_ids: payload.template_ids,
    bulk_send_csv: csvBase64,
  });
  return data;
}
