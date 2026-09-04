import { describe, expect, it } from "vitest";
import { scoreColor } from "./brand";
import { average, pctShare, poleShare, scoreDelta, signed } from "./stats";
import { FSLSM_AXES, strengthLabel } from "./types";

describe("strengthLabel (Felder-Solomon bands)", () => {
  it("maps |score| to mild / moderate / strong", () => {
    expect(strengthLabel(1)).toBe("mild");
    expect(strengthLabel(-3)).toBe("mild");
    expect(strengthLabel(5)).toBe("moderate");
    expect(strengthLabel(-7)).toBe("moderate");
    expect(strengthLabel(9)).toBe("strong");
    expect(strengthLabel(-11)).toBe("strong");
  });
});

describe("scoreColor (High ≥70 / Medium 50–69 / Low <50)", () => {
  it("uses the documented thresholds", () => {
    expect(scoreColor(70)).toBe(scoreColor(100));
    expect(scoreColor(69)).toBe(scoreColor(50));
    expect(scoreColor(49)).toBe(scoreColor(0));
    expect(scoreColor(70)).not.toBe(scoreColor(69));
    expect(scoreColor(50)).not.toBe(scoreColor(49));
  });
});

describe("FSLSM_AXES", () => {
  it("defines the four bipolar axes with pole labels", () => {
    expect(Object.keys(FSLSM_AXES)).toEqual([
      "active_reflective",
      "sensing_intuitive",
      "visual_verbal",
      "sequential_global",
    ]);
    expect(FSLSM_AXES.visual_verbal.poleA).toBe("Visual");
    expect(FSLSM_AXES.visual_verbal.poleB).toBe("Verbal");
  });
});

describe("stats helpers", () => {
  it("signed", () => {
    expect(signed(3)).toBe("+3");
    expect(signed(-2)).toBe("-2");
    expect(signed(0)).toBe("0");
    expect(signed(1.25, 2)).toBe("+1.25");
  });
  it("average", () => {
    expect(average([])).toBeNull();
    expect(average([60, 71])).toBe(65.5);
  });
  it("pctShare", () => {
    expect(pctShare(1, 0)).toBe(0);
    expect(pctShare(1, 3)).toBe(33);
  });
  it("poleShare matches the backend convention (positive → pole A)", () => {
    expect(poleShare([5, 3, -1, -7])).toEqual({ a: 50, b: 50 });
    expect(poleShare([])).toEqual({ a: 0, b: 0 });
    expect(poleShare([1, 1, -1])).toEqual({ a: 67, b: 33 });
  });
  it("scoreDelta", () => {
    expect(scoreDelta(60, 72)).toBe(12);
    expect(scoreDelta(null, 72)).toBeNull();
  });
});
