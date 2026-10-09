import { describe, expect, it } from "vitest";
import { statusKindKey } from "../src/core/settings/endpoint-editor-model";

describe("i18n-Key-Ableitung", () => {
  it("bildet Status-Kinds auf set.ep.status.* ab", () => {
    expect(statusKindKey("not-an-llm-api")).toBe("set.ep.status.not-an-llm-api");
    expect(statusKindKey("ok")).toBe("set.ep.status.ok");
  });
});
