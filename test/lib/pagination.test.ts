import { describe, it, expect, vi } from 'vitest';
import { paginate, collectAll } from '../../src/lib/pagination.js';
import type { PaginatedResponse } from '../../src/types/api.js';

describe('pagination', () => {
  it('yields items from a single page', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({
      data: [{ id: '1' }, { id: '2' }],
      total: 2,
      page: 1,
      per_page: 10,
      total_pages: 1,
    } as PaginatedResponse<{ id: string }>);

    const items: { id: string }[] = [];
    for await (const item of paginate(fetcher, { perPage: 10 })) {
      items.push(item);
    }

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('yields items across multiple pages', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        data: [{ id: '1' }],
        total: 2,
        page: 1,
        per_page: 1,
        total_pages: 2,
      })
      .mockResolvedValueOnce({
        data: [{ id: '2' }],
        total: 2,
        page: 2,
        per_page: 1,
        total_pages: 2,
      });

    const items: { id: string }[] = [];
    for await (const item of paginate(fetcher, { perPage: 1 })) {
      items.push(item);
    }

    expect(items).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('calls onPage callback', async () => {
    const onPage = vi.fn();
    const fetcher = vi.fn().mockResolvedValueOnce({
      data: [{ id: '1' }],
      total: 1,
      page: 1,
      per_page: 10,
      total_pages: 1,
    });

    for await (const _ of paginate(fetcher, { onPage })) {
      // consume
    }

    expect(onPage).toHaveBeenCalledWith(1, 1);
  });

  it('collectAll returns all items', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        data: [{ id: '1' }, { id: '2' }],
        total: 3,
        page: 1,
        per_page: 2,
        total_pages: 2,
      })
      .mockResolvedValueOnce({
        data: [{ id: '3' }],
        total: 3,
        page: 2,
        per_page: 2,
        total_pages: 2,
      });

    const items = await collectAll(fetcher, { perPage: 2 });
    expect(items).toHaveLength(3);
  });
});
