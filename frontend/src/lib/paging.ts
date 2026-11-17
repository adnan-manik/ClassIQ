/**
 * Search-param paging for Server Components.
 *
 * `?page=` arrives as untrusted text — missing, empty, "0", "-3", "abc", or
 * repeated ("?page=2&page=9", which Next hands over as an array). All of those
 * have to land on a sane window rather than sending a negative `range()` to
 * PostgREST, so the parsing lives here where it can be tested.
 */

export interface PageWindow {
  /** 1-based page number, always >= 1. */
  page: number;
  /** 0-based inclusive start, for PostgREST `.range(from, to)`. */
  from: number;
  /** 0-based inclusive end. */
  to: number;
  perPage: number;
}

/** Resolve a `?page=` value into a query window. */
export function pageWindow(
  raw: string | string[] | undefined,
  perPage: number,
): PageWindow {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(first ?? "", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const from = (page - 1) * perPage;
  return { page, from, to: from + perPage - 1, perPage };
}

export interface PageSummary {
  /** Last page that holds any row; 1 even when there are none. */
  lastPage: number;
  /** 1-based index of the first row shown, or 0 when none are. */
  firstShown: number;
  /** 1-based index of the last row shown, or 0 when none are. */
  lastShown: number;
  /** True when `page` is past the end of a non-empty set. */
  beyondEnd: boolean;
}

/** Describe where a window landed, given the total and how many came back. */
export function pageSummary(
  window: PageWindow,
  total: number,
  shown: number,
): PageSummary {
  const lastPage = Math.max(1, Math.ceil(total / window.perPage));
  return {
    lastPage,
    firstShown: shown > 0 ? window.from + 1 : 0,
    lastShown: shown > 0 ? window.from + shown : 0,
    beyondEnd: total > 0 && shown === 0,
  };
}
