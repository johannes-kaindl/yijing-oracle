/**
 * Layout-Messung der Modellzeile am Handy (Welle 29, Chat-Zeile mit obsidian-kit 0.74.0): Mobil-Emulation 390 × 844 und 390 × 508
 * (844 minus 336 pt iOS-Tastatur), Standardtheme hell und dunkel, ein Bild und die Maße je Zustand. Misst, was an der Zeile des
 * Orakel-Panels zählt: nichts ragt über den Rand, die Tippfläche des Neu-laden-Knopfs hat 44 × 44 px (Mobil), Dropdown, Denkstufe und
 * Knopf stehen auf einer Mittellinie, der Modellname im Dropdown ist so lang wie der gewählte Name es zulässt.
 *
 * Läuft gegen die laufende Zweitinstanz (wie `gui-smoke.ts`, Rezept dort); der gebaute Plugin-Stand muss im Staging-Vault liegen
 * (`npm run deploy`). Die Emulation lädt Obsidian neu; am Ende wird zurückgestellt.
 *
 * ```bash
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label yijing-oracle --intent "zeile-layout <tag>" --exclusive focus --port 9625 --ttl 300
 * npm run zeile-layout -- --port 9625 --tag nachher [--out /tmp/yj-w29]
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 * ```
 *
 * Grenze: die Emulation verkleinert den Viewport um die Tastaturhöhe; sie ersetzt weder WKWebView noch die Schublade von Obsidian Mobile.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv, exit } from "node:process";

import { attachTo, bereiteInstanzVor, requireVisible, type Cdp } from "../../tools/obsidian-cdp/cdp.js";
import { startLlmStub } from "../../tools/obsidian-cdp/llm-stub.js";
import { capture } from "../../tools/obsidian-cdp/shot.js";

const PLUGIN_ID = "yijing-oracle";
const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
const BREITE = 390;
const HOEHE = 844;
const TASTATUR = 336;
const MODELL = "google/gemma-3-27b-it-qat-q4_0";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };

const MESS_JS = `
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); if (b.width === 0 && b.height === 0) return null; return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
  const bar = ".yijing-oracle .okit-model-bar";
  const kinder = [...document.querySelectorAll(bar + " *")].map((k) => ({ cls: String(k.className).slice(0, 40), b: k.getBoundingClientRect() })).filter((k) => k.b.width > 0);
  const zeile = r(bar);
  const sel = document.querySelector(bar + " .okit-model-bar-select");
  const titel = (sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "");
  const mitten = [".okit-model-bar-select", ".okit-thinking-control", ".okit-model-bar-refresh"].map((s) => r(bar + " " + s)).filter(Boolean).map((b) => b.y + b.h / 2);
  return {
    viewport: [innerWidth, innerHeight], mobil: document.body.classList.contains("is-mobile"),
    zeile, dropdown: r(bar + " .okit-model-bar-select"), denken: r(bar + " .okit-thinking-control"), neuLaden: r(bar + " .okit-model-bar-refresh"),
    beschriftung: r(bar + " .okit-model-bar-label"), gewaehlt: titel, tooltip: sel ? (sel.getAttribute("title") || sel.getAttribute("aria-label") || "") : "",
    mittellinienSpanne: mitten.length ? +(Math.max(...mitten) - Math.min(...mitten)).toFixed(1) : null,
    ueberRand: zeile ? kinder.filter((k) => k.b.right > zeile.right + 1).map((k) => k.cls) : null,
    seitenBreite: r(".yijing-oracle") ? r(".yijing-oracle").w : null,
  };
`;

interface Box { x: number; y: number; w: number; h: number; right: number; bottom: number }
interface Messung {
  zustand: string; viewport: number[]; mobil: boolean; zeile: Box | null; dropdown: Box | null; denken: Box | null; neuLaden: Box | null; beschriftung: Box | null;
  gewaehlt: string; tooltip: string; mittellinienSpanne: number | null; ueberRand: string[] | null; seitenBreite: number | null;
}

function kurz(m: Messung): string {
  const b = (x: Box | null): string => (x ? `${x.w}×${x.h}@${x.x},${x.y}` : "—");
  return [
    `${m.zustand}: Viewport ${m.viewport.join("×")} mobil ${String(m.mobil)} · Panel ${m.seitenBreite ?? "—"} px breit`,
    `  Zeile ${b(m.zeile)} · Dropdown ${b(m.dropdown)} · Denkstufe ${b(m.denken)} · Neu laden ${b(m.neuLaden)} · Beschriftung ${b(m.beschriftung)}`,
    `  Mittellinien-Spanne ${m.mittellinienSpanne ?? "—"} px (Soll < 1) · über den Rand: ${JSON.stringify(m.ueberRand)} · gewählt „${m.gewaehlt}“ · Tooltip „${m.tooltip}“`,
  ].join("\n");
}

async function main(): Promise<void> {
  const port = Number(flag("--port"));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port <1024-65535> ist Pflicht (9222 gehoert der regulaeren Instanz).");
  const tag = flag("--tag") ?? "lauf";
  const out = flag("--out") ?? "/tmp/yj-w29";
  mkdirSync(out, { recursive: true });
  // `kontext` schaltet /api/v0/models ein: das Kit erkennt LM Studio und bietet die Stufen.
  const stub = await startLlmStub({ models: [MODELL], kontext: { geladen: 8192 }, standard: { text: "Stub-Antwort", model: MODELL } });
  let cdp = await attachTo("workspace", port, PLUGIN_ID);
  if (!cdp) throw new Error(`Kein Obsidian-Fenster fuer Vault „${PLUGIN_ID}“ auf Port ${port}.`);
  const messungen: Messung[] = [];
  let vorher: unknown = null;
  try {
    await requireVisible(cdp);
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null };`);
    await cdp.evaluate(`const p = ${P}; p.settings.llm.endpoints = [{ url: ${JSON.stringify(stub.url)}, model: ${JSON.stringify(MODELL)} }]; p.settings.llm.choice = {}; p.llm.invalidate(); await p.saveSettings(); return true;`);

    // Mobil-Emulation laedt Obsidian neu („Execution context was destroyed“), danach neu anhaengen.
    await cdp.evaluate(`app.emulateMobile(true); return true;`).catch(() => undefined);
    try { cdp.close(); } catch { /* Kontext schon weg */ }
    await sleep(4000);
    const neu = await attachTo("workspace", port, PLUGIN_ID);
    if (!neu) throw new Error("nach dem Neuladen kein Fenster");
    cdp = neu;
    await requireVisible(cdp);
    await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: PLUGIN_ID, sprache: "en" });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: BREITE, height: HOEHE, deviceScaleFactor: 2, mobile: true });
    await sleep(1200);
    if (!(await cdp.evaluate<boolean>(`return document.body.classList.contains("is-mobile");`))) throw new Error("is-mobile nach emulateMobile(true) nicht gesetzt");

    await cdp.evaluate(`app.workspace.detachLeavesOfType("yijing-oracle-panel"); app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-view`)}); return true;`);
    const da = await cdp.evaluate<boolean>(`for (let i = 0; i < 40 && !document.querySelector(".yijing-oracle .okit-model-bar-select"); i++) await new Promise((r) => setTimeout(r, 250)); await new Promise((r) => setTimeout(r, 1200)); return !!document.querySelector(".yijing-oracle .okit-model-bar-select");`);
    if (!da) throw new Error("Orakel-Panel mit Modellzeile oeffnet sich nicht");

    for (const [schema, name] of [["moonstone", "hell"], ["obsidian", "dunkel"]] as const) {
      await cdp.evaluate(`app.vault.setConfig("theme", ${JSON.stringify(schema)}); app.updateTheme(); app.workspace.trigger("css-change"); await new Promise((r) => setTimeout(r, 600)); return true;`);
      for (const mitTastatur of [false, true]) {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: BREITE, height: mitTastatur ? HOEHE - TASTATUR : HOEHE, deviceScaleFactor: 2, mobile: true });
        await sleep(900);
        const zustand = `${tag}-${name}-${mitTastatur ? "tastatur" : "ohne"}`;
        const m = { zustand, ...(await cdp.evaluate<Omit<Messung, "zustand">>(MESS_JS)) };
        messungen.push(m);
        console.log(kurz(m));
        const pfad = join(out, `${zustand}.png`);
        writeFileSync(pfad, await capture(cdp, undefined, 1));
        console.log(`  Bild ${pfad}`);
      }
    }
    writeFileSync(join(out, `${tag}-messung.json`), JSON.stringify(messungen, null, 2));
  } finally {
    if (cdp) {
      await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
      // Das Profil behaelt die Emulation (localStorage): zurueckstellen, sonst startet der naechste Lauf mobil.
      await cdp.evaluate(`app.vault.setConfig("theme", "moonstone"); app.emulateMobile(false); return true;`).catch(() => undefined);
      await sleep(4000);
      const zurueck = await attachTo("workspace", port, PLUGIN_ID).catch(() => null);
      if (zurueck && vorher !== null) {
        await zurueck.evaluate(`const v = ${JSON.stringify(vorher)}; const p = ${P}; p.settings.llm.endpoints = v.eps; if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice; p.llm.invalidate(); await p.saveSettings(); return true;`).catch(() => undefined);
      }
      (zurueck ?? cdp).close();
    }
    await stub.stop();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  exit(1);
});
export type { Cdp };
