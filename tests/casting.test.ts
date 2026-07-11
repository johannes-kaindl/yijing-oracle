import { describe, it, expect } from "vitest";
import {
  BINARY_TO_KING_WEN,
  binary,
  cast,
  kingWen,
  lineState,
  linesFromBinary,
  tossLine,
  type CoinRng,
} from "../src/core/casting";
import hexRaw from "../src/data/hexagrams.json";

const hexagrams = hexRaw as unknown as { number: number; binary: string }[];

// Seed-RNG: gibt die vorgegebene Münzfolge zyklisch zurück.
function seq(bits: (0 | 1)[]): CoinRng {
  let i = 0;
  return () => bits[i++ % bits.length];
}

describe("King-Wen parity gate (mirrors scripts/test-kingwen.mjs)", () => {
  it("maps every hexagram binary → its number (64/64)", () => {
    for (const h of hexagrams) {
      expect(kingWen(h.binary), `binary ${h.binary}`).toBe(h.number);
    }
  });

  it("table has 64 unique entries covering 1..64", () => {
    const nums = Object.values(BINARY_TO_KING_WEN);
    expect(nums.length).toBe(64);
    expect(new Set(nums).size).toBe(64);
    expect(Math.min(...nums)).toBe(1);
    expect(Math.max(...nums)).toBe(64);
  });

  it("every key is a 6-bit binary string", () => {
    for (const b of Object.keys(BINARY_TO_KING_WEN)) expect(b).toMatch(/^[01]{6}$/);
  });

  it("kingWen returns null for unknown binary", () => {
    expect(kingWen("999999")).toBeNull();
  });
});

describe("lineState", () => {
  it("6 = old yin (changing, target yang)", () => expect(lineState(6)).toEqual({ yang: false, changing: true, target: 1 }));
  it("7 = young yang (stable)", () => expect(lineState(7)).toEqual({ yang: true, changing: false, target: 1 }));
  it("8 = young yin (stable)", () => expect(lineState(8)).toEqual({ yang: false, changing: false, target: 0 }));
  it("9 = old yang (changing, target yin)", () => expect(lineState(9)).toEqual({ yang: true, changing: true, target: 0 }));
});

describe("tossLine", () => {
  it("three tails → 6, three heads → 9", () => {
    expect(tossLine(seq([0])).value).toBe(6);
    expect(tossLine(seq([1])).value).toBe(9);
  });
  it("stays within 6..9", () => {
    for (let i = 0; i < 200; i++) {
      const v = tossLine().value;
      expect(v).toBeGreaterThanOrEqual(6);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

describe("cast + binary", () => {
  it("cast produces 6 lines", () => expect(cast(seq([0, 1])).length).toBe(6));

  it("all old-yang (9): primary is hex 1, resulting is hex 2", () => {
    const lines = Array.from({ length: 6 }, () => ({ value: 9 }));
    expect(binary(lines, false)).toBe("111111");
    expect(binary(lines, true)).toBe("000000");
    expect(kingWen(binary(lines, false))).toBe(1);
    expect(kingWen(binary(lines, true))).toBe(2);
  });

  it("linesFromBinary round-trips through binary", () => {
    expect(binary(linesFromBinary("100010"))).toBe("100010");
    expect(kingWen("100010")).toBe(3);
  });
});
