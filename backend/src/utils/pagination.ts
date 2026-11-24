// Paging and text search for list endpoints (the contract's `PageMeta`, `Search`, `Page` and
// `PageSize` parameters). Joi validates the query (`pageQuery` below), so `page` and `pageSize`
// are already integers in range here.
import Joi from "joi";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PageQuery = { page: number; pageSize: number };

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// Joi keys to spread into a list endpoint's query schema. `q` is trimmed, and a blank `q`
// means no search.
export const pageQuery = {
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

export const searchQuery = {
  q: Joi.string().trim().max(100).allow(""),
};

// The LIMIT and OFFSET for one page
export const pageWindow = ({ page, pageSize }: PageQuery) => ({
  limit: pageSize,
  offset: (page - 1) * pageSize,
});

// totalPages is at least 1, so an empty list is "page 1 of 1" rather than "page 1 of 0"
export const pageMeta = (total: number, { page, pageSize }: PageQuery): PageMeta => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

// A `%term%` pattern for ILIKE. `%`, `_` and `\` in the search text are escaped, so a search
// for "50%" matches the text "50%" and not every row. Returns null for a blank search.
export const likePattern = (q: string | undefined) => {
  const text = q?.trim();
  if (!text) return null;
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
};

// Pages an array that is already in memory. Used where the rows have to be built and filtered
// in code first (e.g. a list joined across several tables); the database pages everything else.
export const pageOf = <T>(rows: T[], query: PageQuery) => {
  const { limit, offset } = pageWindow(query);
  return { items: rows.slice(offset, offset + limit), meta: pageMeta(rows.length, query) };
};
