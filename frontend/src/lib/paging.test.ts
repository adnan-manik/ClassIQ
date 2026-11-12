import { describe, expect, it } from "vitest";

import { pageSummary, pageWindow } from "./paging";

describe("pageWindow", () => {
  it("defaults to the first page when the param is absent or empty", () => {
    for (const raw of [undefined, "", []]) {
      expect(pageWindow(raw as string | string[] | undefined, 25)).toEqual({
        page: 1,
        from: 0,
        to: 24,
        perPage: 25,
      });
    }
  });

  it("maps a page number onto an inclusive range", () => {
    expect(pageWindow("2", 25)).toEqual({ page: 2, from: 25, to: 49, perPage: 25 });
    expect(pageWindow("4", 10)).toEqual({ page: 4, from: 30, to: 39, perPage: 10 });
  });

  it("never produces a negative range from junk input", () => {
    // a negative `from` would make PostgREST error rather than return nothing
    for (const raw of ["0", "-3", "abc", "NaN", " ", "1e9999"]) {
      const w = pageWindow(raw, 25);
      expect(w.from).toBeGreaterThanOrEqual(0);
      expect(w.to).toBeGreaterThan(w.from);
      expect(w.page).toBeGreaterThanOrEqual(1);
    }
    expect(pageWindow("-3", 25).page).toBe(1);
    expect(pageWindow("abc", 25).page).toBe(1);
  });

  it("takes the first value when the param is repeated", () => {
    expect(pageWindow(["3", "9"], 25).page).toBe(3);
  });

  it("tolerates a trailing suffix the way parseInt does", () => {
    expect(pageWindow("2abc", 25).page).toBe(2);
  });
});

describe("pageSummary", () => {
  it("reports the window it actually filled", () => {
    const s = pageSummary(pageWindow("1", 25), 60, 25);
    expect(s).toEqual({ lastPage: 3, firstShown: 1, lastShown: 25, beyondEnd: false });
  });

  it("handles a short final page", () => {
    const s = pageSummary(pageWindow("3", 25), 60, 10);
    expect(s.firstShown).toBe(51);
    expect(s.lastShown).toBe(60);
    expect(s.lastPage).toBe(3);
    expect(s.beyondEnd).toBe(false);
  });

  it("keeps one page when there is nothing at all", () => {
    const s = pageSummary(pageWindow(undefined, 25), 0, 0);
    expect(s.lastPage).toBe(1);
    expect(s.firstShown).toBe(0);
    expect(s.lastShown).toBe(0);
    // nothing exists, so this is the empty archive rather than a bad page
    expect(s.beyondEnd).toBe(false);
  });

  it("flags a page past the end of a non-empty archive", () => {
    const s = pageSummary(pageWindow("99", 25), 60, 0);
    expect(s.beyondEnd).toBe(true);
    expect(s.lastPage).toBe(3);
    expect(s.firstShown).toBe(0);
  });

  it("counts an exact multiple without an empty trailing page", () => {
    expect(pageSummary(pageWindow("2", 25), 50, 25).lastPage).toBe(2);
    expect(pageSummary(pageWindow("1", 25), 25, 25).lastPage).toBe(1);
  });
});
