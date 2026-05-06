import type { PaginatedResponse } from '../types/api.js';

export interface PaginationParams {
  page?: number;
  per_page?: number;
  limit?: number;
}

export function normalizePaginationParams<T extends PaginationParams>(
  params: T = {} as T,
): Omit<T, 'limit'> & { per_page?: number } {
  const { limit, per_page: perPage, ...rest } = params;
  const pageSize = perPage ?? limit;
  return {
    ...rest,
    ...(pageSize !== undefined ? { per_page: pageSize } : {}),
  } as Omit<T, 'limit'> & { per_page?: number };
}

/**
 * Normalizes varying API list response shapes into a consistent PaginatedResponse.
 * The SignWell API uses different field names across endpoints.
 */
export function normalizePaginatedResponse<T>(
  data: Record<string, unknown>,
  itemsKeys: string[],
  params: PaginationParams = {},
): PaginatedResponse<T> {
  let items: unknown = undefined;
  for (const key of itemsKeys) {
    if (data[key]) { items = data[key]; break; }
  }
  if (!items) items = data.data || data;

  const total = (data.total_entries ?? data.total_count ?? data.total ?? (Array.isArray(items) ? items.length : 0)) as number;
  const page = (data.current_page ?? data.page ?? params.page ?? 1) as number;
  const limit = params.per_page ?? params.limit ?? 20;
  const totalPages = ((data.total_pages as number | undefined) ?? Math.ceil(total / limit)) || 1;

  return {
    data: Array.isArray(items) ? items : [],
    total,
    page,
    per_page: limit,
    total_pages: totalPages,
  };
}

export interface PaginateOptions {
  perPage?: number;
  onPage?: (current: number, total: number) => void;
}

export async function* paginate<T>(
  fetcher: (page: number, perPage: number) => Promise<PaginatedResponse<T>>,
  options: PaginateOptions = {},
): AsyncGenerator<T> {
  const perPage = options.perPage || 100;
  let page = 1;
  let totalPages = 1;

  do {
    const response = await fetcher(page, perPage);
    totalPages = response.total_pages || 1;

    if (options.onPage) {
      options.onPage(page, totalPages);
    }

    for (const item of response.data) {
      yield item;
    }

    page++;
  } while (page <= totalPages);
}

export async function collectAll<T>(
  fetcher: (page: number, perPage: number) => Promise<PaginatedResponse<T>>,
  options: PaginateOptions = {},
): Promise<T[]> {
  const items: T[] = [];
  for await (const item of paginate(fetcher, options)) {
    items.push(item);
  }
  return items;
}
