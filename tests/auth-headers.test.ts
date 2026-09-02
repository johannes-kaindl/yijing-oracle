import { describe, expect, it } from "vitest";
import { authHeaders } from "../src/core/llm/auth";

describe("authHeaders", () => {
  it("baut einen Bearer-Header aus einem Schluessel", () => {
    expect(authHeaders("sk-abc123")).toEqual({ Authorization: "Bearer sk-abc123" });
  });

  it("liefert KEINEN Header ohne Schluessel", () => {
    expect(authHeaders(undefined)).toEqual({});
    expect(authHeaders("")).toEqual({});
  });

  // Der Fall, der den Unterschied macht: ein Feld, in dem nur Leerzeichen stehen, ist
  // fuer den Nutzer leer. Ein "Bearer " ohne Wert waere schlimmer als gar kein Header —
  // ein Server antwortet darauf mit 401 statt den anonymen Zugang zu erlauben.
  it("behandelt reinen Leerraum wie leer", () => {
    expect(authHeaders("   ")).toEqual({});
  });

  it("schneidet Leerraum um den Schluessel ab", () => {
    expect(authHeaders("  sk-abc  ")).toEqual({ Authorization: "Bearer sk-abc" });
  });
});
