import { getClient, type ApiClientOptions } from './client.js';
import type { Webhook } from '../types/api.js';

export async function listWebhooks(options: ApiClientOptions = {}): Promise<Webhook[]> {
  const client = getClient(options);
  const { data } = await client.get('/hooks');
  return data.hooks || data.data || (Array.isArray(data) ? data : []);
}

export async function createWebhook(
  payload: { url: string; event_types?: string[] },
  options: ApiClientOptions = {},
): Promise<Webhook> {
  const client = getClient(options);
  const { data } = await client.post<Webhook>('/hooks', {
    callback_url: payload.url,
    ...(payload.event_types ? { event_types: payload.event_types } : {}),
  });
  return data;
}

export async function deleteWebhook(id: string, options: ApiClientOptions = {}): Promise<void> {
  const client = getClient(options);
  await client.delete(`/hooks/${id}`);
}
