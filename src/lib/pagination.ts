import type { PaginatedResponse } from '../types/api.js';

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
