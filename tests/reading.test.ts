import { describe, it, expect } from "vitest";
import { buildReading } from "../src/core/reading";
import { type Line } from "../src/core/casting";

const L = (...values: number[]): Line[] => values.map((value) => ({ value }));

describe("buildReading", () => {
  it("no changing lines → no resulting hexagram", () => {
    // all young (7/8) → stable. 7,8,7,8,7,8 = "101010" = hex 63.
    const r = buildReading(L(7, 8, 7, 8, 7, 8));
    expect(r.primaryNumber).toBe(63);
    expect(r.changingPositions).toEqual([]);
    expect(r.resultingBinary).toBeNull();
    expect(r.resultingNumber).toBeNull();
    expect(r.allChanging).toBe(false);
  });

  it("changing positions are 1-based from the bottom", () => {
    // position 1 (index 0) = 9 (changing), position 4 (index 3) = 6 (changing).
    const r = buildReading(L(9, 7, 8, 6, 8, 7));
    expect(r.changingPositions).toEqual([1, 4]);
    expect(r.resultingNumber).not.toBeNull();
  });

  it("all six changing → allChanging true (hex 1 → hex 2)", () => {
    const r = buildReading(L(9, 9, 9, 9, 9, 9));
    expect(r.primaryNumber).toBe(1);
    expect(r.resultingNumber).toBe(2);
    expect(r.allChanging).toBe(true);
    expect(r.changingPositions).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("throws on wrong line count", () => {
    expect(() => buildReading(L(7, 7, 7))).toThrow(/exactly 6/);
  });
});
