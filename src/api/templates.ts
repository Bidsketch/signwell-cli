import { getClient, type ApiClientOptions } from './client.js';
import type { Template, PaginatedResponse, DocumentFile } from '../types/api.js';

export interface CreateTemplatePayload {
  name: string;
  draft?: boolean;
  text_tags?: boolean;
  test_mode?: boolean;
  files: DocumentFile[];
  placeholders?: Array<{
    id?: string;
    name: string;
    email?: string;
  }>;
  fields?: unknown[];
}

export async function createTemplate(
  payload: CreateTemplatePayload,
  options: ApiClientOptions = {},
): Promise<Template> {
  const client = getClient(options);
  const body = {
    ...payload,
    placeholders: payload.placeholders?.map((p, i) => ({
      id: p.id || `placeholder_${i + 1}`,
      ...p,
    })),
  };
  const { data } = await client.post<Template>('/document_templates', body);
  return data;
}

export async function getTemplate(id: string, options: ApiClientOptions = {}): Promise<Template> {
  const client = getClient(options);
  const { data } = await client.get<Template>(`/document_templates/${id}`);
  return data;
}

export async function listTemplates(
  params: { page?: number; per_page?: number } = {},
  options: ApiClientOptions = {},
): Promise<PaginatedResponse<Template>> {
  const client = getClient(options);
  const { data } = await client.get('/document_templates', { params });

  const templates = data.templates || data.document_templates || data.data || data;
  const total = data.total_count || data.total || (Array.isArray(templates) ? templates.length : 0);
  const page = data.current_page || params.page || 1;
  const perPage = params.per_page || 20;
  const totalPages = data.total_pages || Math.ceil(total / perPage) || 1;

  return {
    data: Array.isArray(templates) ? templates : [],
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
  };
}

export async function updateTemplate(
  id: string,
  payload: Partial<CreateTemplatePayload>,
  options: ApiClientOptions = {},
): Promise<Template> {
  const client = getClient(options);
  const { data } = await client.put<Template>(`/document_templates/${id}`, payload);
  return data;
}

export async function deleteTemplate(id: string, options: ApiClientOptions = {}): Promise<void> {
  const client = getClient(options);
  await client.delete(`/document_templates/${id}`);
}
