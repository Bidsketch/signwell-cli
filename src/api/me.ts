import { getClient, type ApiClientOptions } from './client.js';
import type { MeResponse } from '../types/api.js';

export async function getMe(options: ApiClientOptions = {}): Promise<MeResponse> {
  const client = getClient(options);
  const { data } = await client.get<MeResponse>('/me');
  return data;
}
