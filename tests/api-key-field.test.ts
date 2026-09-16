import { describe, expect, it } from "vitest";
import { Setting } from "obsidian";
import { llmRows } from "../src/obsidian/settings/llm-section";
import { DEFAULT_LLM_SETTINGS } from "../src/core/llm/settings-defaults";
import { type SectionCtx } from "../src/obsidian/settings/section-ctx";

// Das Feld traegt einen API-Schluessel und war bis 2026-09-02 ein gewoehnliches Textfeld:
// der Schluessel stand bei Screenshots und Bildschirmfreigaben im Klartext.
//
// Warum das eine render-Hatch erzwingt: Obsidians deklarative Settings-API kennt in 1.13
// keinen Passwort-Typ — `SettingTextControl` hat genau `type: 'text'` und `placeholder`
// (gemessen an obsidian.d.ts 1.13.1). Maskieren geht nur ueber das inputEl, und daran
// kommt nur ein eigener Renderer. Die Zeile bleibt trotzdem in der Einstellungs-Suche:
// `searchable`/`aliases` sitzen auf SettingDefinitionBase, von der auch
// SettingDefinitionRender erbt.

function fakeCtx(): SectionCtx {
  const settings = { llm: { ...DEFAULT_LLM_SETTINGS } } as unknown as SectionCtx["host"]["settings"];
  // Kein LLM Endpoint Manager installiert — findEndpointManager(app) muss damit null liefern,
  // ohne dass der Test das Fremdplugin kennt.
  const app = { plugins: { plugins: {} } } as unknown as SectionCtx["app"];
  return {
    host: { settings } as SectionCtx["host"],
    app,
    write: () => {},
    save: () => {},
    rerender: () => {},
  } as unknown as SectionCtx;
}

/** Die Zeile mit dem API-Schluessel, ueber ihren Schluessel gesucht statt ueber die
 *  Beschriftung — die haengt an der UI-Sprache. */
function apiKeyZeile(): { render?: (s: Setting) => unknown; control?: unknown; aliases?: string[] } {
  const rows = llmRows(fakeCtx()) as {
    name?: string; aliases?: string[]; render?: (s: Setting) => unknown; control?: { key?: string };
  }[];
  const zeile = rows.find((r) => r.control?.key === "llm.apiKey")
    ?? rows.find((r) => typeof r.name === "string" && /api/i.test(r.name));
  expect(zeile, "Zeile fuer llm.apiKey nicht gefunden").toBeTruthy();
  return zeile as { render?: (s: Setting) => unknown; control?: unknown; aliases?: string[] };
}

describe("API-Schluessel-Feld", () => {
  it("wird maskiert dargestellt", () => {
    const zeile = apiKeyZeile();
    expect(zeile.render, "Zeile muss selbst rendern — ein deklaratives Control kann nicht maskieren").toBeTypeOf("function");

    const setting = new Setting(undefined as never);
    zeile.render?.(setting);

    const inputs = (setting as unknown as { components: { inputEl?: { type?: string } }[] }).components;
    const feld = inputs.find((c) => c.inputEl);
    expect(feld?.inputEl?.type).toBe("password");
  });

  // Ein maskiertes Feld ist schwerer wiederzufinden als ein beschriftetes: der Wert ist
  // unlesbar, es bleibt nur die Beschriftung — und die haengt an der UI-Sprache. Aliase
  // machen die Zeile ueber die Begriffe auffindbar, unter denen ein Nutzer sie sucht.
  // Sie sind zugleich der Messpunkt fuer F6 im GUI-Smoke: "bearer" kommt in keiner
  // Beschriftung vor, ein Treffer beweist also, dass Aliase wirklich durchschlagen.
  it("traegt sprachunabhaengige Suchbegriffe", () => {
    const aliases = apiKeyZeile().aliases ?? [];
    expect(aliases).toContain("bearer");
    expect(aliases).toContain("token");
  });
});
