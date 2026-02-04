/**
 * Cursor-Based Pagination
 * 
 * Efficient pagination using cursors instead of offsets
 * for better performance with large datasets.
 */

export interface CursorPaginationParams {
  /** Cursor pointing to the start of the page */
  cursor?: string;
  /** Number of items per page */
  limit?: number;
  /** Sort field */
  sort?: string;
  /** Sort direction */
  direction?: 'asc' | 'desc';
}

export interface CursorPaginationResult<T> {
  /** Items in the current page */
  items: T[];
  /** Total number of items (if available) */
  total?: number;
  /** Whether more items exist */
  hasMore: boolean;
  /** Cursor for the next page */
  nextCursor?: string;
  /** Cursor for the previous page */
  prevCursor?: string;
}

export interface CursorData {
  /** Timestamp for sorting */
  timestamp: number;
  /** ID for tie-breaking */
  id: string;
  /** Additional sort fields */
  [key: string]: unknown;
}

/**
 * Encode cursor data to base64 string
 */
export function encodeCursor(data: CursorData): string {
  const json = JSON.stringify(data);
  return Buffer.from(json).toString('base64url');
}

/**
 * Decode cursor from base64 string
 */
export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    return JSON.parse(json) as CursorData;
  } catch {
    return null;
  }
}

/**
 * Create pagination links
 */
export function createPaginationLinks(
  baseUrl: string,
  params: CursorPaginationParams,
  result: CursorPaginationResult<unknown>
): { self: string; next?: string; prev?: string } {
  const url = new URL(baseUrl, 'http://localhost');
  
  // Add current params
  if (params.limit) url.searchParams.set('limit', params.limit.toString());
  if (params.sort) url.searchParams.set('sort', params.sort);
  if (params.direction) url.searchParams.set('direction', params.direction);
  
  const self = url.toString().replace('http://localhost', '');
  
  // Next link
  let next: string | undefined;
  if (result.nextCursor) {
    url.searchParams.set('cursor', result.nextCursor);
    next = url.toString().replace('http://localhost', '');
  }
  
  // Previous link
  let prev: string | undefined;
  if (result.prevCursor) {
    url.searchParams.set('cursor', result.prevCursor);
    prev = url.toString().replace('http://localhost', '');
  }
  
  return { self, next, prev };
}

/**
 * Default pagination limit
 */
export const DEFAULT_PAGE_LIMIT = 50;

/**
 * Maximum pagination limit
 */
export const MAX_PAGE_LIMIT = 500;

/**
 * Parse pagination parameters from request
 */
export function parsePaginationParams(
  query: Record<string, unknown> | CursorPaginationParams
): Required<CursorPaginationParams> {
  const limit = Math.min(
    Math.max(1, parseInt(String(query["limit"] || DEFAULT_PAGE_LIMIT), 10)),
    MAX_PAGE_LIMIT
  );
  
  return {
    cursor: query["cursor"] ? String(query["cursor"]) : undefined,
    limit,
    sort: String(query["sort"] || 'created_at'),
    direction: (query["direction"] === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
  };
}

/**
 * Paginate an array using cursor-based pagination
 */
export function paginateArray<T extends { id: string; created_at?: Date | string }>(
  items: T[],
  params: CursorPaginationParams
): CursorPaginationResult<T> {
  const { cursor, limit = DEFAULT_PAGE_LIMIT } = parsePaginationParams(params);
  
  let filtered = [...items];
  
  // Apply cursor filter
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      const cursorTimestamp = decoded.timestamp;
      filtered = filtered.filter(item => {
        const itemTimestamp = item.created_at 
          ? new Date(item.created_at).getTime() 
          : 0;
        return itemTimestamp < cursorTimestamp;
      });
    }
  }
  
  // Get page
  const pageItems = filtered.slice(0, limit + 1);
  const hasMore = pageItems.length > limit;
  const resultItems = pageItems.slice(0, limit);
  
  // Generate cursors
  const nextCursor = hasMore && resultItems.length > 0
    ? encodeCursor({
        timestamp: resultItems[resultItems.length - 1].created_at 
          ? new Date(resultItems[resultItems.length - 1].created_at!).getTime() 
          : Date.now(),
        id: resultItems[resultItems.length - 1].id,
      })
    : undefined;
  
  return {
    items: resultItems,
    hasMore,
    nextCursor,
  };
}

/**
 * Create cursor from item
 */
export function createCursor<T extends { id: string; created_at?: Date | string }>(
  item: T
): string {
  return encodeCursor({
    timestamp: item.created_at 
      ? new Date(item.created_at).getTime() 
      : Date.now(),
    id: item.id,
  });
}

/**
 * Offset-based pagination (for compatibility)
 */
export interface OffsetPaginationParams {
  page?: number;
  pageSize?: number;
}

export interface OffsetPaginationResult<T> extends CursorPaginationResult<T> {
  page: number;
  pageSize: number;
}

/**
 * Parse offset pagination parameters
 */
export function parseOffsetPaginationParams(
  query: Record<string, unknown> | OffsetPaginationParams
): Required<OffsetPaginationParams> {
  return {
    page: Math.max(1, parseInt(String(query["page"] || 1), 10)),
    pageSize: Math.min(
      Math.max(1, parseInt(String(query["pageSize"] || DEFAULT_PAGE_LIMIT), 10)),
      MAX_PAGE_LIMIT
    ),
  };
}

/**
 * Paginate using offset (for compatibility)
 */
export function paginateWithOffset<T>(
  items: T[],
  params: OffsetPaginationParams
): OffsetPaginationResult<T> {
  const { page, pageSize } = parseOffsetPaginationParams(params);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginated = items.slice(start, end);
  
  return {
    items: paginated,
    page,
    pageSize,
    total: items.length,
    hasMore: end < items.length,
  };
}
