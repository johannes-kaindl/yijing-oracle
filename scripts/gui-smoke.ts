/**
 * GUI-Smoke-Treiber — faehrt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand.
 *
 * Warum getrackt (CORE-TEST-02 b): Der ComfyUI-Adapter wurde am 2026-08-04 gebaut und lag
 * danach zwoelf Tage ungeprueft auf `main` — die Hand-Checkliste (11 Schritte, Handover-Note)
 * ist teuer genug, dass sie liegen bleibt. Was hier automatisiert ist, kostet beim naechsten
 * Mal einen Befehl.
 *
 * Was er prueft, das die 187 vitest-Faelle strukturell nicht koennen: die **Settings-Migration
 * gegen eine echte Bestands-`data.json`** (der Unit-Test kennt nur das Objekt, nicht Obsidians
 * Lade-Kette), das **Umschalten der Bild-Sektion** (Rerender im echten Settings-Modal) und den
 * **Bildlauf gegen die echte ComfyUI**.
 *
 * ## Voraussetzung
 *
 * ⚠️ **Zuerst pruefen, wer sonst an Obsidian haengt.** Obsidian ist Single-Instance — ein
 * `quit` trifft die Instanz, an der moeglicherweise eine andere Session arbeitet, und zerstoert
 * deren Zustand. Der eigene Lauf ist danach sauber gruen; der Schaden entsteht woanders und
 * faellt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "laeuft bereits — NICHT beenden"
 * ```
 *
 * Hoert der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
 * `vault-open` ueber IPC oeffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
 * waehlt, nicht die Reihenfolge. ⚠️ Die Port-Pruefung ersetzt die Frage nicht: sie zeigt aktive
 * CDP-Treiber, aber nicht, wer ein Fenster offen haelt oder auf den Port wartet.
 *
 * Erst wenn nichts laeuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.
 *
 * Obsidian muss mit offenem Debug-Port laufen (der einzige Handgriff, der Handarbeit bleibt —
 * die App muss dafuer neu gestartet werden):
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * ```
 *
 * Dann, mit deployter Plugin-Version (`npm run deploy`):
 *
 * ```bash
 * npm run smoke:gui -- --vault 10_Pallas
 * npm run smoke:gui -- --vault 10_Pallas --kein-bild   # Abschnitt D ueberspringen
 * ```
 *
 * ⚠️ Chromium drosselt das Rendering nicht-fokussierter Fenster: ohne `Page.bringToFront`
 * **und** `osascript … activate` bleibt die Ansicht leer und man debuggt ein Phantom.
 *
 * ## Was dieser Lauf am Wirt aendert — und zurueckdreht
 *
 * Der Migrations-Abschnitt schreibt eine kuenstliche Bestands-`data.json` und laedt das
 * Plugin neu. Der Vorwert wird **vor** dem `try` gelesen, zusaetzlich als Datei neben der
 * `data.json` gesichert (fuer den Fall, dass der Prozess hart abbricht) und im `finally`
 * zurueckgeschrieben. Erzeugte Notizen und Anhaenge wandern in den Papierkorb.
 */

import { execFileSync } from "node:child_process";

import { Cdp, attachTo, pollUntil } from "../../tools/obsidian-cdp/cdp.js";
import { requireEigenerBuild } from "../../tools/obsidian-cdp/vault.js";
import { join } from "node:path";

const PLUGIN_ID = "yijing-oracle";
/** manifest.json → name. Nicht lokalisiert — taugt als Anker in der Einstellungs-Suche. */
const PLUGIN_NAME = "Yijing Oracle";
/** src/obsidian/view.ts: VIEW_TYPE_YIJING. */
const PANEL_VIEW = "yijing-oracle-panel";
const DATA_PATH = `.obsidian/plugins/${PLUGIN_ID}/data.json`;
/** Sicherungskopie fuer den Fall, dass der Lauf hart abbricht (Ctrl-C, Absturz). */
const DATA_RESCUE = `.obsidian/plugins/${PLUGIN_ID}/data.json.smoke-rescue`;
/** src/core/settings/api-key-storage.ts: API_KEY_SECRET_ID — der feste Schluesselbund-Eintrag. */
const API_KEY_SECRET_ID = "yijing-oracle-llm-api-key";

/** Bestands-`data.json` in der Form von 0.3.0: kennt weder `backend` noch `comfyWorkflow`
 *  noch `comfyStepsOverride`. Genau das ist Schritt 2 der Handover-Checkliste — die Frage
 *  ist nicht, ob die neuen Felder Defaults bekommen, sondern ob die **alten** ueberleben. */
const BESTAND_030 = {
  register: "neutral",
  readingLang: "auto",
  includeFrontmatter: true,
  image: {
    endpoint: "http://127.0.0.1:7860",
    styleSuffix: "ink wash painting, soft light, muted colors",
    negativePrompt: "text, watermark",
    size: 1024,
    steps: 31,
  },
  llm: {
    endpoints: ["http://127.0.0.1:1234", "http://127.0.0.1:11434"],
    model: "qwen3-30b",
    apiKey: "smoke-schluessel",
  },
};

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}
const checks: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "✅" : "❌"} ${name} — ${detail}`);
}

/** Was der Lauf bewusst NICHT misst. Steht im Protokoll, damit eine Luecke nicht wie
 *  ein bestandener Punkt aussieht. */
/** Uebersprungene Abschnitte. Bewusst eine EIGENE Liste und nicht `checks`: ein
 *  uebersprungener Abschnitt ist weder bestanden noch durchgefallen, und beide Zuordnungen
 *  waeren falsch (obsidian-transmute hat ihn einmal als gruen gezaehlt, vault-rag als rot —
 *  derselbe Baufehler in beide Richtungen). Er gehoert aber IN die Bilanz: sonst liest sich
 *  ein „27/27 bestanden" wie ein vollstaendiger Lauf, obwohl zwei Abschnitte nie liefen. */
const uebersprungen: string[] = [];

function skipped(name: string, reason: string): void {
  uebersprungen.push(name);
  console.log(`⏭️  ${name} — uebersprungen: ${reason}`);
}

const schlaf = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─── Helfer, die den Pruefling kennen ──────────────────────────────────────────────

/** Plugin neu laden, ohne Obsidian neu zu starten. Danach ist die Instanz eine **andere** —
 *  jede gemerkte Referenz auf `plugin` ist tot. */
async function reloadPlugin(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
    await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 600));
    return true;
  `);
}

async function readVaultFile(cdp: Cdp, path: string): Promise<string | null> {
  return cdp.evaluate<string | null>(`
    const p = ${JSON.stringify(path)};
    if (!(await app.vault.adapter.exists(p))) return null;
    return await app.vault.adapter.read(p);
  `);
}

async function writeVaultFile(cdp: Cdp, path: string, body: string): Promise<void> {
  await cdp.evaluate(`
    await app.vault.adapter.write(${JSON.stringify(path)}, ${JSON.stringify(body)});
    return true;
  `);
}

async function removeVaultFile(cdp: Cdp, path: string): Promise<void> {
  await cdp.evaluate(`
    const p = ${JSON.stringify(path)};
    if (await app.vault.adapter.exists(p)) await app.vault.adapter.remove(p);
    return true;
  `);
}

/** Schluesselbund-Zustand: `null` als Ganzes, wenn Obsidian keinen hat (< 1.11.4). */
async function schluesselbund(cdp: Cdp): Promise<{ wert: string | null } | null> {
  return cdp.evaluate<{ wert: string | null } | null>(`
    if (!app.secretStorage) return null;
    return { wert: app.secretStorage.getSecret(${JSON.stringify(API_KEY_SECRET_ID)}) };
  `);
}

/** Eintrag zuruecksetzen: loeschen, wenn er vorher fehlte (deleteSecret gibt es zur Laufzeit,
 *  nicht in der .d.ts — s. _docs/LESSONS.md 2026-08-30), sonst den Vorwert schreiben. */
async function schluesselbundZuruecksetzen(cdp: Cdp, vorher: string | null): Promise<void> {
  await cdp.evaluate(`
    const s = app.secretStorage; if (!s) return false;
    const id = ${JSON.stringify(API_KEY_SECRET_ID)};
    if (${JSON.stringify(vorher)} === null && typeof s.deleteSecret === "function") s.deleteSecret(id);
    else s.setSecret(id, ${JSON.stringify(vorher ?? "")});
    return true;
  `);
}

/** Die Einstellungen des Prueflings auslesen — als reines Datenobjekt. */
async function settingsOf(cdp: Cdp): Promise<Record<string, unknown> | null> {
  return cdp.evaluate<Record<string, unknown> | null>(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    return p ? JSON.parse(JSON.stringify(p.settings)) : null;
  `);
}

/**
 * Wo die Einstellungen-Oberflaeche liegt.
 *
 * Ab Obsidian 1.13 sind die Einstellungen ein **eigenes Fenster**, kein Modal im
 * Hauptfenster (gemessen am 2026-08-16 gegen 1.13.7: `app.setting.activeTab.id` meldete
 * korrekt `yijing-oracle`, waehrend `document.querySelector(".modal.mod-settings")` im
 * Workspace-Fenster `null` blieb — der Aufruf gelingt, die Messung greift ins Leere).
 * Bis 1.12 war es ein Modal. Der Treiber haelt deshalb beide Faelle offen und leitet die
 * Antwort aus der Sache ab, statt eine Version anzunehmen.
 */
interface SettingsUi {
  /** Verbindung zu dem Renderer, der die Oberflaeche traegt. */
  cdp: Cdp;
  /** Selektor-Praefix: "" im eigenen Fenster, ".modal.mod-settings " beim Modal. */
  praefix: string;
  /** Nur gesetzt, wenn eine ZWEITE Verbindung aufgebaut wurde (die geschlossen gehoert). */
  eigenesFenster: boolean;
}

async function openSettingsTab(cdp: Cdp, port: number): Promise<SettingsUi | null> {
  await cdp.evaluate(`
    app.setting.open();
    await new Promise((r) => setTimeout(r, 400));
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 800));
    return true;
  `);

  // Erkennung ODER statt UND: `.yijing-ep-status` markiert den LOKALEN Endpunkt-Editor, der
  // bei installiertem LLM Endpoint Manager durch buildEndpointSourceSection ersetzt wird und
  // dann fehlt (Abschnitt M) — der Plugin-Name im Tab-Text ist in beiden Faellen da.
  const marker = `Boolean(root.querySelector(".yijing-ep-status")) || Boolean(root.textContent && root.textContent.includes(${JSON.stringify(PLUGIN_NAME)}))`;

  // Fall 1 (bis 1.12): Modal im selben Fenster.
  const alsModal = await cdp.evaluate<boolean>(
    `const root = document.querySelector(".modal.mod-settings"); return Boolean(root) && (${marker});`,
  );
  if (alsModal) return { cdp, praefix: ".modal.mod-settings ", eigenesFenster: false };

  // Fall 2 (ab 1.13): eigenes Fenster. Das Kriterium ist nicht der Titel (der ist
  // lokalisiert), sondern die Sache: kein Workspace, aber unsere Sektion im DOM.
  const zweit = await attachTo("settings", port, PLUGIN_ID);
  if (!zweit) return null;
  const da = await zweit.evaluate<boolean>(`const root = document; return ${marker};`);
  if (!da) {
    zweit.close();
    return null;
  }
  return { cdp: zweit, praefix: "", eigenesFenster: true };
}

/** Schliesst die Oberflaeche — der Befehl gehoert ins Hauptfenster, auch wenn gemessen
 *  wurde im zweiten. */
async function closeSettings(cdp: Cdp, ui: SettingsUi | null): Promise<void> {
  if (ui?.eigenesFenster) ui.cdp.close();
  await cdp.evaluate(`app.setting.close(); await new Promise((r) => setTimeout(r, 200)); return true;`);
}

/**
 * Die Bild-Sektion im Settings-Modal beschreiben — **sprachunabhaengig**.
 *
 * Nicht ueber Beschriftungen: die haengen an der UI-Sprache, und ein Treiber, der in
 * Jays deutschem Obsidian gruen ist und in einem englischen rot, misst die Sprache statt
 * des Verhaltens. Die Platzhalter sind dagegen Konstanten aus dem Code
 * (`DEFAULT_IMAGE_SETTINGS.steps` = 28, Override = "—").
 */
/** Wurzel-Ausdruck fuer Messungen in der Einstellungen-Oberflaeche. Im eigenen Fenster
 *  ist das `document`, beim Modal dessen Container — damit dieselben Selektoren in
 *  beiden Faellen dasselbe treffen. */
function wurzelAusdruck(ui: SettingsUi): string {
  return ui.praefix ? `document.querySelector(".modal.mod-settings")` : `document`;
}

async function bildSektion(ui: SettingsUi): Promise<{
  workflowArea: boolean;
  stepsA1111: boolean;
  stepsOverride: boolean;
  backendWert: string | null;
}> {
  return ui.cdp.evaluate(`
    const modal = ${wurzelAusdruck(ui)};
    if (!modal) return { workflowArea: false, stepsA1111: false, stepsOverride: false, backendWert: null };
    const sel = [...modal.querySelectorAll("select")].find(
      (s) => s.querySelector('option[value="comfyui"]') && s.querySelector('option[value="a1111"]'),
    );
    return {
      workflowArea: Boolean(modal.querySelector(".yijing-workflow-status")),
      stepsA1111: Boolean(modal.querySelector('input[placeholder="28"]')),
      stepsOverride: Boolean(modal.querySelector('input[placeholder="—"]')),
      backendWert: sel ? sel.value : null,
    };
  `);
}

/** Backend ueber das echte Dropdown umschalten (nicht ueber die Settings-API) — geprueft
 *  werden soll ja gerade der Rerender, den `onChange` ausloest. */
async function setzeBackend(ui: SettingsUi, wert: "a1111" | "comfyui"): Promise<boolean> {
  const ok = Boolean(await ui.cdp.evaluate<boolean>(`
    const modal = ${wurzelAusdruck(ui)};
    if (!modal) return false;
    const sel = [...modal.querySelectorAll("select")].find(
      (s) => s.querySelector('option[value="comfyui"]') && s.querySelector('option[value="a1111"]'),
    );
    if (!sel) return false;
    sel.value = ${JSON.stringify(wert)};
    sel.dispatchEvent(new Event("change"));
    return true;
  `));
  await schlaf(600); // rerender() zeichnet die Sektion neu
  return ok;
}

/** Text in die Workflow-Textarea legen und Obsidians `onChange` ausloesen. */
async function setzeWorkflow(ui: SettingsUi, json: string): Promise<boolean> {
  const ok = Boolean(await ui.cdp.evaluate<boolean>(`
    const status = document.querySelector("${ui.praefix}.yijing-workflow-status");
    const item = status ? status.closest(".setting-item") : null;
    const ta = item ? item.querySelector("textarea") : null;
    if (!ta) return false;
    ta.value = ${JSON.stringify(json)};
    ta.dispatchEvent(new Event("input"));
    return true;
  `));
  await schlaf(400);
  return ok;
}

async function workflowStatus(ui: SettingsUi): Promise<{ ok: boolean; fehler: boolean; text: string } | null> {
  return ui.cdp.evaluate(`
    const el = document.querySelector("${ui.praefix}.yijing-workflow-status");
    if (!el) return null;
    return { ok: el.classList.contains("is-ok"), fehler: el.classList.contains("is-error"), text: (el.textContent || "").trim() };
  `);
}

/** Das Orakel-Panel oeffnen und auf sein DOM warten. */
async function openPanel(cdp: Cdp): Promise<boolean> {
  await cdp.evaluate(`
    app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-view`)});
    await new Promise((r) => setTimeout(r, 700));
    return true;
  `);
  const da = await pollUntil<boolean>(cdp, `return Boolean(document.querySelector(".yijing-oracle .yijing-title"));`, 8000, 400);
  return Boolean(da);
}

/** Einen Knopf im Panel ueber seine Position klicken — die Beschriftungen sind
 *  sprachabhaengig, die Reihenfolge der Aktionsreihen ist es nicht. */
async function clickPanelButton(cdp: Cdp, auswahl: string): Promise<boolean> {
  return Boolean(await cdp.evaluate<boolean>(`
    const el = document.querySelector(${JSON.stringify(auswahl)});
    if (!el) return false;
    el.click();
    await new Promise((r) => setTimeout(r, 400));
    return true;
  `));
}

// ─── Abschnitte ────────────────────────────────────────────────────────────────────

/** A — Laden und Panel (Handover-Schritt 1). */
async function abschnittPanel(cdp: Cdp): Promise<void> {
  console.log("\n── A · Laden und Panel ──");

  const aktiv = await cdp.evaluate<boolean>(`return Boolean(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]);`);
  record("A1 Plugin aktiv", Boolean(aktiv), aktiv ? "app.plugins kennt die Instanz" : "Plugin nicht geladen");
  if (!aktiv) return;

  const offen = await openPanel(cdp);
  record("A2 Panel oeffnet", offen, offen ? ".yijing-oracle mit Titel im DOM" : "Panel-DOM kam nicht zustande");
  if (!offen) return;

  // Frage stellen und werfen. Der Wurf-Knopf ist der einzige in der ERSTEN Aktionsreihe.
  await cdp.evaluate(`
    const q = document.querySelector(".yijing-oracle .yijing-question");
    if (q) { q.value = "Smoke-Lauf: was traegt diese Pruefung?"; q.dispatchEvent(new Event("input")); }
    return true;
  `);
  const geworfen = await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
  await schlaf(500);

  const wurf = await cdp.evaluate<{ linien: number; vorschau: number; frageLeer: boolean }>(`
    const root = document.querySelector(".yijing-oracle");
    if (!root) return { linien: 0, vorschau: 0, frageLeer: false };
    const q = root.querySelector(".yijing-question");
    return {
      linien: root.querySelectorAll(".yijing-line").length,
      vorschau: (root.querySelector(".yijing-preview")?.textContent || "").trim().length,
      frageLeer: q ? q.value === "" : false,
    };
  `);
  record(
    "A3 Wurf erzeugt ein Hexagramm",
    geworfen && wurf.linien === 6,
    `${wurf.linien} Linien gezeichnet (erwartet 6)`,
  );
  record(
    "A4 Vorschau traegt Text",
    wurf.vorschau > 200,
    `${wurf.vorschau} Zeichen in .yijing-preview`,
  );
  // Regression aus 0.1.1: "Neue Frage" liess den alten Text stehen.
  record("A5 Frage-Feld ist nach dem Wurf leer", wurf.frageLeer, wurf.frageLeer ? "Feld geleert" : "alter Text steht noch");
}

/** B — Bestandsverhalten (Handover-Schritt 2). Der teuerste Punkt der Checkliste und
 *  der einzige, bei dem ein Fehlschlag Jays produktive Konfiguration betrifft. */
async function abschnittMigration(cdp: Cdp): Promise<void> {
  console.log("\n── B · Bestandsverhalten (Settings-Migration) ──");

  await writeVaultFile(cdp, DATA_PATH, JSON.stringify(BESTAND_030, null, 2));
  await reloadPlugin(cdp);

  const s = await settingsOf(cdp);
  if (!s) {
    record("B0 Plugin laedt mit Bestandsdaten", false, "keine Instanz nach dem Neuladen — Ladefehler");
    return;
  }
  record("B0 Plugin laedt mit Bestandsdaten", true, "Instanz nach dem Neuladen vorhanden");

  const img = (s.image ?? {}) as Record<string, unknown>;
  const llm = (s.llm ?? {}) as Record<string, unknown>;

  record(
    "B1 backend faellt auf a1111",
    img.backend === "a1111",
    `backend=${JSON.stringify(img.backend)} (erwartet "a1111")`,
  );
  record(
    "B2 Bild-Endpunkt unveraendert",
    img.endpoint === BESTAND_030.image.endpoint,
    `endpoint=${JSON.stringify(img.endpoint)}`,
  );
  record(
    "B3 eigene Werte ueberleben (steps/size/negativ)",
    img.steps === 31 && img.size === 1024 && img.negativePrompt === BESTAND_030.image.negativePrompt,
    `steps=${String(img.steps)} size=${String(img.size)} negativ=${JSON.stringify(img.negativePrompt)}`,
  );
  record(
    "B4 neue Comfy-Felder bekommen Defaults",
    img.comfyWorkflow === "" && img.comfyStepsOverride === null,
    `comfyWorkflow=${JSON.stringify(img.comfyWorkflow)} comfyStepsOverride=${JSON.stringify(img.comfyStepsOverride)}`,
  );

  const eps = Array.isArray(llm.endpoints) ? (llm.endpoints as string[]) : [];
  record(
    "B5 LLM-Endpunktliste unveraendert",
    eps.length === 2 && eps[0] === BESTAND_030.llm.endpoints[0] && eps[1] === BESTAND_030.llm.endpoints[1],
    `endpoints=${JSON.stringify(eps)}`,
  );
  // Der Fund aus dem Kit-0.23.0-Seed: ein globaler Schluessel, den eine Migration still
  // fallen laesst, ergibt "Endpunkt nie erreichbar" ohne jede Meldung.
  record(
    "B6 API-Schluessel ueberlebt die Migration",
    llm.apiKey === BESTAND_030.llm.apiKey,
    `apiKey=${JSON.stringify(llm.apiKey)}`,
  );
  // Gegenstueck zu stripLegacyLlmFields: die Leiche darf NICHT zurueckkommen.
  record(
    "B7 keine Alt-Leiche activeEndpoint",
    !("activeEndpoint" in llm),
    "activeEndpoint" in llm ? "Feld ist wieder da" : "Feld fehlt wie erwartet",
  );
  // Seit 2026-09-03 wandert der Schluessel beim Laden in Obsidians Schluesselbund und
  // data.json wird bereinigt — B6 misst nur den Speicher, das hier misst die PLATTE. Zwei
  // richtige Ausgaenge (Muster obsidian-paperize 2026-09-02): mit Schluesselbund liegt der
  // Wert dort und data.json ist leer; ohne (< 1.11.4) bleibt er in data.json wie bis 0.5.1.
  const platte = JSON.parse((await readVaultFile(cdp, DATA_PATH)) ?? "{}") as { llm?: { apiKey?: string } };
  const aufPlatte = platte.llm?.apiKey ?? "(fehlt)";
  const bund = await schluesselbund(cdp);
  record(
    "B8 Altwert wandert beim Laden in den Schluesselbund, data.json wird bereinigt",
    bund ? aufPlatte === "" && bund.wert === BESTAND_030.llm.apiKey : aufPlatte === BESTAND_030.llm.apiKey,
    bund
      ? `data.json apiKey=${JSON.stringify(aufPlatte)} · Schluesselbund=${JSON.stringify(bund.wert)}`
      : `kein Schluesselbund (< 1.11.4) — data.json apiKey=${JSON.stringify(aufPlatte)}`,
  );
}

/** C — Bild-Sektion im Settings-Modal (Handover-Schritte 3, 6, 9). */
async function abschnittSettings(cdp: Cdp, port: number, workflowFixture: string): Promise<void> {
  console.log("\n── C · Bild-Sektion im Einstellungen-Fenster ──");

  const ui = await openSettingsTab(cdp, port);
  record(
    "C1 Einstellungen-Tab oeffnet",
    ui !== null,
    ui ? `Bild-Sektion sichtbar (${ui.eigenesFenster ? "eigenes Fenster, ab 1.13" : "Modal, bis 1.12"})` : "Tab-Inhalt in keinem Fenster gefunden",
  );
  if (!ui) return;

  const vorher = await bildSektion(ui);
  record(
    "C2 A1111-Ansicht zeigt Schritte, kein Workflow-Feld",
    vorher.backendWert === "a1111" && vorher.stepsA1111 && !vorher.workflowArea,
    `backend=${String(vorher.backendWert)} stepsFeld=${vorher.stepsA1111} workflowFeld=${vorher.workflowArea}`,
  );

  const umgeschaltet = await setzeBackend(ui, "comfyui");
  const comfy = await bildSektion(ui);
  record(
    "C3 Umschalten auf ComfyUI tauscht die Felder",
    umgeschaltet && comfy.workflowArea && comfy.stepsOverride && !comfy.stepsA1111,
    `workflowFeld=${comfy.workflowArea} override=${comfy.stepsOverride} a1111Steps=${comfy.stepsA1111}`,
  );
  if (!comfy.workflowArea) return;

  const eingefuegt = await setzeWorkflow(ui, workflowFixture);
  const ok = await workflowStatus(ui);
  const idCount = ok ? (ok.text.match(/=\d+/g) ?? []).length : 0;
  record(
    "C4 gueltiger Workflow wird erkannt",
    eingefuegt && Boolean(ok?.ok) && idCount === 4,
    ok ? `${idCount} Node-IDs · "${ok.text}"` : "keine Statuszeile",
  );

  await setzeWorkflow(ui, workflowFixture.slice(0, Math.floor(workflowFixture.length / 2)));
  const kaputt = await workflowStatus(ui);
  record(
    "C5 kaputtes JSON meldet einen Fehler statt zu haengen",
    Boolean(kaputt?.fehler) && (kaputt?.text.length ?? 0) > 0 && kaputt?.text !== ok?.text,
    kaputt ? `"${kaputt.text}"` : "keine Statuszeile",
  );

  // Leeres Feld: keine Meldung, kein Fehler — der Zustand "noch nicht eingerichtet".
  await setzeWorkflow(ui, "");
  const leer = await workflowStatus(ui);
  record(
    "C6 leeres Feld meldet nichts",
    leer !== null && !leer.ok && !leer.fehler && leer.text === "",
    leer ? `ok=${leer.ok} fehler=${leer.fehler} text="${leer.text}"` : "keine Statuszeile",
  );

  await setzeBackend(ui, "a1111");
  const zurueck = await bildSektion(ui);
  record(
    "C7 Zurueckschalten stellt die A1111-Felder wieder her",
    zurueck.stepsA1111 && !zurueck.workflowArea,
    `stepsFeld=${zurueck.stepsA1111} workflowFeld=${zurueck.workflowArea}`,
  );

  await closeSettings(cdp, ui);
}

/**
 * F — die deklarative Settings-API (`getSettingDefinitions`, Obsidian >= 1.13).
 *
 * Warum das ein eigener Abschnitt ist: die Migration verlegt das Rendern der Einstellungen
 * vom eigenen Code zum Host. Was danach in der Oberflaeche steht, kann kein vitest-Fall mehr
 * zeigen — und die drei Fallstricke der Umstellung sind alle **stille**: bedingte Zeilen, die
 * nie erscheinen (`visible` wertet der native Renderer an Gruppen-Items nicht aus), ein Tab,
 * der nach einer Zustandsaenderung nicht nachzieht (der Host rendert gecachte `settingItems`),
 * und Zeilen, die zwar rendern, aber nicht in der Einstellungs-Suche landen — dem einzigen
 * Grund, aus dem die Umstellung ueberhaupt lohnt.
 *
 * Unter 1.12 gibt es den nativen Pfad nicht; dort wird der Abschnitt uebersprungen statt rot.
 */
async function abschnittDeklarativ(cdp: Cdp, port: number): Promise<void> {
  console.log("\n── F · Deklarative Settings-API ──");

  const ui = await openSettingsTab(cdp, port);
  if (!ui) {
    skipped("F Deklarative API", "Einstellungen-Tab in keinem Fenster gefunden");
    return;
  }

  // Die Definitionen leben im HAUPTfenster: das ausgelagerte Einstellungen-Fenster hat
  // seinen eigenen Kontext und kennt kein `app` (gemessen 2026-08-16 gegen 1.13.7 — ein
  // `app.setting.activeTab` dort wirft "app is not defined").
  const defs = await cdp.evaluate<{
    hatApi: boolean;
    hatUpdate: boolean;
    gruppen: number;
    leereGruppen: number;
    uebernommen: number | null;
    fmMitFeldern: number;
    fmOhneFelder: number;
  } | null>(`
    const tab = app.setting.activeTab;
    if (!tab || typeof tab.getSettingDefinitions !== "function") return null;
    const fmGruppe = (d) => d.find((g) => (g.items || []).some((i) => i.control && i.control.key === "includeFrontmatter"));
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];

    const vorher = p.settings.includeFrontmatter;
    p.settings.includeFrontmatter = true;
    const mit = (fmGruppe(tab.getSettingDefinitions()).items || []).length;
    p.settings.includeFrontmatter = false;
    const ohne = (fmGruppe(tab.getSettingDefinitions()).items || []).length;
    p.settings.includeFrontmatter = vorher;

    const d = tab.getSettingDefinitions();
    return {
      hatApi: true,
      hatUpdate: typeof tab.update === "function",
      gruppen: d.length,
      leereGruppen: d.filter((g) => !(g.items || []).length).length,
      uebernommen: Array.isArray(tab.settingItems) ? tab.settingItems.length : null,
      fmMitFeldern: mit,
      fmOhneFelder: ohne,
    };
  `);

  if (!defs?.hatUpdate) {
    // Kein update() → Obsidian < 1.13, der native Pfad existiert nicht.
    skipped("F Deklarative API", "Obsidian ohne native 1.13-Settings-API (Fallback-Pfad)");
    await closeSettings(cdp, ui);
    return;
  }

  record(
    "F1 Tab liefert deklarative Definitionen",
    defs.gruppen > 0 && defs.leereGruppen === 0 && defs.uebernommen === defs.gruppen,
    `${defs.gruppen} Gruppen, keine leer, vom Host uebernommen: ${String(defs.uebernommen)}`,
  );

  // Genau der Fallstrick, an dem zwei Nachbar-Plugins haengen geblieben sind: bedingte
  // Zeilen muessen WEGGELASSEN werden. Ein `visible: false` waere hier unsichtbar falsch —
  // die Zahl bliebe gleich und die Zeile stuende trotzdem in der Oberflaeche.
  record(
    "F2 bedingte Zeilen werden weggelassen, nicht versteckt",
    defs.fmOhneFelder === 1 && defs.fmMitFeldern > 1,
    `Frontmatter-Gruppe: ${defs.fmMitFeldern} Zeilen mit Feldern, ${defs.fmOhneFelder} ohne`,
  );

  const zeilenVorher = await zeilenZahl(ui);
  await cdp.evaluate(`
    await app.setting.activeTab.setControlValue("includeFrontmatter", false);
    await new Promise((r) => setTimeout(r, 500));
    return true;
  `);
  const zeilenAus = await zeilenZahl(ui);
  await cdp.evaluate(`
    await app.setting.activeTab.setControlValue("includeFrontmatter", true);
    await new Promise((r) => setTimeout(r, 500));
    return true;
  `);
  const zeilenWieder = await zeilenZahl(ui);
  const erwarteteDifferenz = defs.fmMitFeldern - defs.fmOhneFelder;
  record(
    "F3 Oberflaeche zieht nach einer Wertaenderung nach",
    zeilenVorher - zeilenAus === erwarteteDifferenz && zeilenWieder === zeilenVorher,
    `Zeilen ${zeilenVorher} → ${zeilenAus} → ${zeilenWieder} (erwartete Differenz ${erwarteteDifferenz})`,
  );

  // Der eigentliche Gewinn der Umstellung. Der Suchbegriff kommt aus der eigenen Definition,
  // nicht aus einer festen Zeichenkette — sonst misst der Treiber die UI-Sprache.
  const begriff = await cdp.evaluate<string>(`
    const d = app.setting.activeTab.getSettingDefinitions();
    return d[0].items[0].name;
  `);
  const treffer = await sucheInEinstellungen(ui, begriff);
  const nichts = await sucheInEinstellungen(ui, "zzqqxx-gibtesnicht");
  record(
    "F4 Einstellungen erscheinen in Obsidians Einstellungs-Suche",
    treffer > 0 && nichts === 0,
    `"${begriff}" → ${treffer} Treffer unter "${PLUGIN_NAME}", Unsinn → ${nichts}`,
  );

  // F5 prueft den ANDEREN Pfad. Unter 1.13 ruft der Host `display()` nie — der Fallback
  // fuer aeltere Obsidian-Versionen liefe also ungeprueft mit. Ein direkter Aufruf zeichnet
  // ihn in denselben Container: dieselben Zeilen, mit der klassischen Setting-API gebaut.
  // Das ersetzt keine Messung auf einem echten 1.12, deckt aber den teuren Fehler ab (der
  // Walker zeichnet die Struktur gar nicht oder nur halb).
  const nativZeilen = await zeilenZahl(ui);
  await cdp.evaluate(`
    app.setting.activeTab.display();
    await new Promise((r) => setTimeout(r, 700));
    return true;
  `);
  const fallbackZeilen = await zeilenZahl(ui);
  record(
    "F5 Fallback-Pfad (< 1.13) zeichnet dieselbe Struktur",
    fallbackZeilen === nativZeilen,
    `nativ ${nativZeilen} Zeilen, display()-Fallback ${fallbackZeilen}`,
  );

  // F6/F7 messen die API-Schluessel-Zeile. Sie ist der einzige Fall, in dem eine Zeile
  // maskieren MUSS und die deklarative API es nicht kann (SettingTextControl kennt nur
  // type: 'text') — sie ist deshalb eine render-Hatch. Zwei Dinge koennen dabei still
  // schiefgehen, und beide waeren dem Nutzer gegenueber schwerwiegend:
  //   F6 — die Zeile faellt aus der Einstellungs-Suche. Genau die Auffindbarkeit war der
  //        ganze Ertrag von 0.5.0. Gesucht wird nach "token": der Begriff steht in KEINEM der
  //        vier Strings der Zeile (name/desc in EN und DE), ein Treffer beweist also, dass
  //        `aliases` durchschlaegt, und nicht nur, dass irgendein Wort irgendwo vorkommt.
  //        ⚠️ Hier stand zuerst "bearer" — und der Punkt war GRUEN, obwohl die Gegenprobe die
  //        Aliase entfernt hatte: "Authorization: Bearer …" steht in der Erklaerzeile, die
  //        derselbe Commit hinzugefuegt hat. Der Punkt mass die Beschreibung statt der Aliase.
  //        Gefunden hat das nur die Sabotage; ein gruener Erstlauf haette den Fehler
  //        beglaubigt (Muster von markdown-presentation, 2026-09-02: ein Punkt, der trotz
  //        Sabotage gruen BLEIBT, ist sofort verdaechtig).
  //   F7 — die Maskierung greift im nativen Pfad nicht. Der Unit-Test misst den Renderer
  //        gegen den Mock; ob Obsidian das inputEl wirklich so uebernimmt, sagt nur das
  //        laufende Programm.
  const trefferAlias = await sucheInEinstellungen(ui, "token");
  record(
    "F6 maskierte Zeile bleibt ueber Aliase auffindbar",
    trefferAlias > 0,
    `"token" → ${trefferAlias} Treffer unter "${PLUGIN_NAME}" (Begriff steht nur in den aliases)`,
  );

  await sucheInEinstellungen(ui, "");
  const maskiert = await ui.cdp.evaluate<{ felder: number; typen: string[] }>(`
    const wurzel = document.querySelector(".vertical-tab-content-container") || document;
    const felder = [...wurzel.querySelectorAll("input")].filter((i) => i.type === "password");
    return { felder: felder.length, typen: felder.map((f) => f.type) };
  `);
  record(
    "F7 API-Schluessel-Feld ist maskiert",
    maskiert.felder === 1,
    `${maskiert.felder} Feld(er) mit type=password im Plugin-Tab`,
  );

  // F8 misst den SPEICHERpfad ueber das echte Feld (B8 den Ladepfad): eine Eingabe muss im
  // Schluesselbund ankommen und data.json leer lassen. Bewusst ueber die Komponente statt
  // ueber `plugin.settings` — ein Punkt, der den Zustand direkt schreibt, haette den Weg,
  // auf dem ein Defekt saesse, nie betreten (REGISTRY: „Pruefpunkt, der den Defektpfad
  // umgeht"). Der native Setter + `input`-Event: Obsidians TextComponent hoert auf `input`,
  // eine blosse Zuweisung an `value` feuert nichts. Getippt wird im Einstellungen-Fenster
  // (eigener JS-Kontext, kennt kein `app`), gemessen im Hauptfenster.
  const F8_WERT = "smoke-f8-schluessel";
  const getippt = await ui.cdp.evaluate<boolean>(`
    const wurzel = document.querySelector(".vertical-tab-content-container") || document;
    const feld = [...wurzel.querySelectorAll("input")].find((i) => i.type === "password");
    if (!feld) return false;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value").set.call(feld, ${JSON.stringify(F8_WERT)});
    feld.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  `);
  let f8 = { bund: null as { wert: string | null } | null, platte: "(nicht gelesen)" };
  for (let i = 0; i < 10 && getippt; i++) {
    await schlaf(300);
    f8.bund = await schluesselbund(cdp);
    if (f8.bund?.wert === F8_WERT || f8.bund === null) break;
  }
  const f8Platte = JSON.parse((await readVaultFile(cdp, DATA_PATH)) ?? "{}") as { llm?: { apiKey?: string } };
  f8.platte = f8Platte.llm?.apiKey ?? "(fehlt)";
  record(
    "F8 Eingabe im Feld landet im Schluesselbund, nicht in data.json",
    getippt && (f8.bund ? f8.bund.wert === F8_WERT && f8.platte === "" : f8.platte === F8_WERT),
    !getippt
      ? "kein Passwortfeld gefunden"
      : f8.bund
        ? `Schluesselbund=${JSON.stringify(f8.bund.wert)} · data.json apiKey=${JSON.stringify(f8.platte)}`
        : `kein Schluesselbund (< 1.11.4) — data.json apiKey=${JSON.stringify(f8.platte)}`,
  );

  await closeSettings(cdp, ui);
}

/** Gerenderte Setting-Zeilen in der Einstellungen-Oberflaeche. */
async function zeilenZahl(ui: SettingsUi): Promise<number> {
  return ui.cdp.evaluate<number>(`
    const wurzel = ${wurzelAusdruck(ui)};
    return wurzel ? wurzel.querySelectorAll(".setting-item").length : -1;
  `);
}

/** Tippt in Obsidians Einstellungs-Suche und zaehlt die Treffer, die UNSEREM Plugin
 *  zugeordnet sind — die Ergebnisse stehen je Tab in einer eigenen Gruppe. */
async function sucheInEinstellungen(ui: SettingsUi, begriff: string): Promise<number> {
  return ui.cdp.evaluate<number>(`
    const feld = document.querySelector('input[type="search"]');
    if (!feld) return -1;
    feld.value = ${JSON.stringify(begriff)};
    feld.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    const gruppe = [...document.querySelectorAll(".setting-search-result-group")].find(
      (g) => g.querySelector(".setting-search-result-tab-label")?.textContent?.trim() === ${JSON.stringify(PLUGIN_NAME)},
    );
    return gruppe ? gruppe.querySelectorAll(".setting-search-result-item").length : 0;
  `);
}

/** D — echter Bildlauf gegen ComfyUI (Handover-Schritte 4, 7, 8). Braucht einen
 *  laufenden Server; ohne ihn wird der Abschnitt als uebersprungen protokolliert,
 *  nicht als bestanden. */
async function abschnittBild(cdp: Cdp, endpoint: string, workflowFixture: string): Promise<void> {
  console.log("\n── D · Bildlauf gegen die echte ComfyUI ──");

  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    p.settings.image.backend = "comfyui";
    p.settings.image.endpoint = ${JSON.stringify(endpoint)};
    p.settings.image.comfyWorkflow = ${JSON.stringify(workflowFixture)};
    p.settings.image.size = 512;
    p.settings.image.comfyStepsOverride = 8;
    await p.saveSettings();
    return true;
  `);
  // Das Panel liest die Einstellungen beim Zeichnen — neu aufbauen statt hoffen.
  await cdp.evaluate(`
    for (const l of app.workspace.getLeavesOfType(${JSON.stringify(PANEL_VIEW)})) l.detach();
    await new Promise((r) => setTimeout(r, 300));
    return true;
  `);
  await openPanel(cdp);
  await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
  await schlaf(500);

  const kasten = await cdp.evaluate<boolean>(`return Boolean(document.querySelector(".yijing-artwork"));`);
  record("D1 Bild-Kasten erscheint bei gesetztem Endpunkt", Boolean(kasten), kasten ? ".yijing-artwork im Panel" : "Kasten fehlt");
  if (!kasten) return;

  const gestartet = await clickPanelButton(cdp, ".yijing-artwork .yijing-actions button");
  record("D2 Generieren startet", gestartet, gestartet ? "Knopf geklickt" : "kein Knopf im Bild-Kasten");
  if (!gestartet) return;

  // Die Anzeige waehrend des Laufs. Zwei Ausgaenge sind richtig — ein Schrittzaehler
  // (Socket steht) oder der genannte Grund (Socket abgewiesen). Falsch ist nur das
  // Dritte: ein stummes "Bild wird generiert…", das minutenlang steht und von einem
  // haengenden Lauf nicht zu unterscheiden ist. Genau das war der Befund vom 2026-08-16.
  const anzeige = await pollUntil<string>(
    cdp,
    `const s = (document.querySelector(".yijing-artwork .yijing-empty")?.textContent || "");
     if (/\\d+\\s*\\/\\s*\\d+/.test(s)) return "zaehler";
     if (/cors|origin/i.test(s)) return "erklaert";
     return null;`,
    45_000,
    1000,
  );

  const bild = await pollUntil<number>(
    cdp,
    `const i = document.querySelector(".yijing-artwork-img"); return i && i.src.startsWith("data:image/png;base64,") ? i.src.length : 0;`,
    240_000,
    2000,
  );
  record(
    "D3 Bild kommt an und ist ein PNG",
    (bild ?? 0) > 10_000,
    `${bild ?? 0} Zeichen data:image/png (0 = kein Bild)`,
  );
  record(
    "D4 Anzeige zeigt Fortschritt oder nennt seinen Grund",
    anzeige !== null,
    anzeige === "zaehler"
      ? "Schrittzaehler gesehen (Socket steht)"
      : anzeige === "erklaert"
        ? "kein Socket, aber der Grund steht in der Zeile (ComfyUI-Origin-Pruefung)"
        : "stummes 'Bild wird generiert…' — sieht aus wie ein haengender Lauf",
  );
  if (!bild) return;

  const szene = await cdp.evaluate<number>(`return (document.querySelector(".yijing-artwork-scene")?.textContent || "").trim().length;`);
  record("D5 Szenen-Satz steht unter dem Bild", szene > 20, `${szene} Zeichen`);
}

/** D-Anhang — Speichern samt Anhang (Handover-Schritt 8). Legt eine Notiz im echten
 *  Vault an; sie wandert am Ende in den Papierkorb. */
async function abschnittSpeichern(cdp: Cdp, aufraeumen: string[]): Promise<void> {
  console.log("\n── E · Reading speichern ──");

  const vorher = await cdp.evaluate<string[]>(`return app.vault.getMarkdownFiles().map((f) => f.path);`);
  // Die zweite Aktionsreihe unter der Weissagung traegt "Speichern".
  const geklickt = await clickPanelButton(cdp, ".yijing-oracle > .yijing-actions:nth-of-type(2) button");
  await schlaf(1500);

  const neu = await cdp.evaluate<string[]>(`return app.vault.getMarkdownFiles().map((f) => f.path);`);
  const entstanden = neu.filter((p) => !vorher.includes(p));
  record(
    "E1 Speichern legt genau eine Notiz an",
    geklickt && entstanden.length === 1,
    entstanden.length ? entstanden.join(", ") : "keine neue Notiz",
  );
  if (entstanden.length !== 1) return;
  aufraeumen.push(entstanden[0]);

  const inhalt = await cdp.evaluate<{ laenge: number; bild: string | null }>(`
    const f = app.vault.getAbstractFileByPath(${JSON.stringify(entstanden[0])});
    const text = await app.vault.read(f);
    const m = text.match(/!\\[\\[([^\\]]+\\.png)\\]\\]/);
    return { laenge: text.length, bild: m ? m[1] : null };
  `);
  record("E2 Notiz traegt den Reading-Text", inhalt.laenge > 500, `${inhalt.laenge} Zeichen`);

  if (inhalt.bild) {
    const anhang = await cdp.evaluate<string | null>(`
      const f = app.metadataCache.getFirstLinkpathDest(${JSON.stringify(inhalt.bild)}, ${JSON.stringify(entstanden[0])});
      return f ? f.path : null;
    `);
    record("E3 Bild liegt als Anhang im Vault", Boolean(anhang), anhang ?? `Einbettung zeigt auf ${inhalt.bild}, Datei fehlt`);
    if (anhang) aufraeumen.push(anhang);
  } else {
    record("E3 Bild liegt als Anhang im Vault", false, "keine ![[…png]]-Einbettung in der Notiz");
  }
}

// --- M · LLM Endpoint Manager (optionale Fremd-Quelle) ------------------------------
// uebernommen aus lingotuner/scripts/gui-smoke.ts (Commits 2d32e53, 1899b68, 66bd0be),
// 2026-09-16 — Selektoren und Aufruf-Konstrukte auf yijing-oracle zugeschnitten
// (.yijing-oracle-Panel statt .lt-*, resolveLlmEndpoint()/generateInterpretation() statt
// tune(), M2b prueft ueber settings.llm.choice statt settings.choice).

const MANAGER_PLUGIN_ID = "llm-endpoint-manager";
const MANAGER_DEFAULT_MODEL = "smoke-manager-model";
const LOCAL_FALLBACK_MODEL = "smoke-lokal-modell";

interface FakeChatEndpoint { url: string; close: () => Promise<void>; chatCalls: () => number; lastModel: () => string | null }

/** Eigener Mini-HTTP-Server statt eines echten LLM-Servers oder des echten Manager-Plugins —
 *  M1-M3 pruefen die KONSUMENTEN-Seite (resolveLlmEndpoint()/findEndpointManager() in
 *  view.ts), nicht den Manager selbst. Sammelt den Request-Body VOLLSTAENDIG ein, bevor
 *  geantwortet wird (kein Race gegen die eigene Antwort — Fund aus lingotuner 66bd0be). */
async function startFakeChatEndpoint(modelId: string): Promise<FakeChatEndpoint> {
  const { createServer } = await import("node:http");
  let chatCalls = 0;
  let lastModel: string | null = null;
  const server = createServer((req, res) => {
    // Der Renderer laeuft unter app://obsidian.md — ohne CORS-Header blockt der Browser den
    // Preflight (OPTIONS) und die eigentliche Anfrage sieht der Server nie.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    if (req.url?.includes("/v1/models") === true) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: modelId, object: "model" }] }));
      return;
    }
    if (req.method === "POST" && req.url?.includes("/v1/chat/completions") === true) {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      req.on("end", () => {
        chatCalls += 1;
        try { lastModel = (JSON.parse(body) as { model?: unknown }).model as string ?? null; } catch { lastModel = null; }
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" }, finish_reason: null }], model: modelId })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], model: modelId })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve(); }); }),
    chatCalls: () => chatCalls,
    lastModel: () => lastModel,
  };
}

/** Injiziert eine FAKE `llm-endpoint-manager`-API — `findEndpointManager()` prueft nur die
 *  FORM (version===1 + alle Methoden als Funktion), keine Herkunft. `config.model` (nicht nur
 *  `defaultModel`) ist gesetzt, weil der ECHTE Manager beides setzt — ohne das Feld wuerde ein
 *  Fehler wie lingotuners C1 (config.model ueberschreibt eine getroffene Modellwahl) hier
 *  nicht reproduziert. Sichert einen vorher vorhandenen Eintrag statt ihn zu ueberschreiben
 *  (`window.__smokeVorherManager`, IM Renderer geparkt — ein echtes Plugin-Objekt traegt
 *  Methoden, die eine CDP-Rundreise ueber Node nicht ueberlebt). */
async function installFakeManager(cdp: Cdp, url: string): Promise<void> {
  await cdp.evaluate(`
    if (!("__smokeVorherManager" in window)) {
      window.__smokeVorherManager = app.plugins.plugins[${JSON.stringify(MANAGER_PLUGIN_ID)}] ?? null;
    }
    const ep = { id: "fake-mgr-ep", label: "Fake Manager Endpoint", url: ${JSON.stringify(url)}, provider: "openai", capabilities: ["chat"], defaultModel: ${JSON.stringify(MANAGER_DEFAULT_MODEL)}, enabled: true, hasSecret: false };
    const api = {
      version: 1,
      list: (filter) => [ep],
      get: (id) => (id === ep.id ? ep : null),
      resolve: async (capability, opts) => ({ id: ep.id, label: ep.label, config: { url: ${JSON.stringify(url)}, model: ${JSON.stringify(MANAGER_DEFAULT_MODEL)} }, defaultModel: ${JSON.stringify(MANAGER_DEFAULT_MODEL)} }),
      materialize: async (id, opts) => (id === ep.id ? { id: ep.id, label: ep.label, config: { url: ${JSON.stringify(url)}, model: ${JSON.stringify(MANAGER_DEFAULT_MODEL)} }, defaultModel: ${JSON.stringify(MANAGER_DEFAULT_MODEL)} } : { error: "not-found" }),
      models: async (id) => (id === ep.id ? [${JSON.stringify(MANAGER_DEFAULT_MODEL)}] : { error: "not-found" }),
      importEndpoints: async (eps, capability) => ({ added: [], merged: [], skipped: eps.map((e) => e.url) }),
      on: (event, cb) => (() => {}),
    };
    app.plugins.plugins[${JSON.stringify(MANAGER_PLUGIN_ID)}] = { api };
    return { ok: true };
  `);
}

/** Stellt den VOR `installFakeManager()` vorgefundenen Eintrag wieder her, statt ihn zu
 *  loeschen — idempotent bei einem Aufruf ohne vorheriges `installFakeManager()`. */
async function removeFakeManager(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    if ("__smokeVorherManager" in window) {
      const vorher = window.__smokeVorherManager;
      if (vorher === null) delete app.plugins.plugins[${JSON.stringify(MANAGER_PLUGIN_ID)}];
      else app.plugins.plugins[${JSON.stringify(MANAGER_PLUGIN_ID)}] = vorher;
      delete window.__smokeVorherManager;
    } else {
      delete app.plugins.plugins[${JSON.stringify(MANAGER_PLUGIN_ID)}];
    }
    return { ok: true };
  `);
}

const MANAGED_TEXT = ["Endpunkte kommen vom LLM Endpoint Manager", "Endpoints come from the LLM Endpoint Manager"];

/** Ein Wurf + Deutungslauf: braucht das offene Panel, wirft neu (das Ergebnis selbst ist fuer
 *  M irrelevant) und klickt danach den Deuten-Knopf — der ist der einzige Knopf in
 *  `.yijing-interpretation-inner .yijing-actions`, solange keine Deutung vorliegt. */
async function laufeDeutung(cdp: Cdp): Promise<boolean> {
  const offen = await openPanel(cdp);
  if (!offen) return false;
  await cdp.evaluate(`
    const q = document.querySelector(".yijing-oracle .yijing-question");
    if (q) { q.value = "Smoke M: Endpunkt-Manager"; q.dispatchEvent(new Event("input")); }
    return true;
  `);
  const geworfen = await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
  if (!geworfen) return false;
  await schlaf(500);
  const geklickt = await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button");
  if (!geklickt) return false;
  const fertig = await pollUntil<boolean>(
    cdp,
    `const body = document.querySelector(".yijing-interpretation-body");
     return Boolean(body && body.textContent && body.textContent.trim().length > 0) ? true : null;`,
    15000,
    300,
  );
  return Boolean(fertig);
}

/** M1-M3 (+M2b): Manager an → Settings zeigen den Baustein statt der lokalen Liste, ein Lauf
 *  geht an den Manager-Endpunkt mit dem korrekten Modell; eine Modellwahl gegenueber dem
 *  Manager gewinnt gegen dessen Default (M2b, Regression aus lingotuner C1); Manager aus →
 *  beides faellt auf lokal zurueck. Ein einziger aeusserer try/finally raeumt Fake-Server und
 *  injizierte API auf, egal wo es abbricht. */
async function pruefeManager(cdp: Cdp, port: number): Promise<void> {
  console.log("\nM · LLM Endpoint Manager (optionale Fremd-Quelle)");
  let fake: FakeChatEndpoint | null = null;
  let localFake: FakeChatEndpoint | null = null;
  let ui: SettingsUi | null = null;
  let vorherEndpoints: unknown = null;
  const NAMEN = [
    "M1 Settings zeigen den Manager statt der lokalen Liste",
    "M2 Lauf nutzt den Manager-Endpunkt und das Default-Modell",
    "M2b Manager-Lauf nutzt gewaehltes Modell, nicht den Endpunkt-Default (C1)",
    "M3 Manager aus → lokale Liste in Settings und im Lauf",
  ];
  try {
    fake = await startFakeChatEndpoint(MANAGER_DEFAULT_MODEL);
    console.log(`  Fake-Manager-Endpunkt: ${fake.url}`);
    await installFakeManager(cdp, fake.url);

    // M1 — Settings zeigen den Manager-Baustein (managed-Text), keine .yijing-ep-status-Zeile
    // (der Marker des lokalen Listen-Editors).
    ui = await openSettingsTab(cdp, port);
    if (!ui) { for (const n of NAMEN) skipped(n, "Settings-Oberflaeche nicht gefunden"); return; }
    const body = await ui.cdp.evaluate<string>(`return (${wurzelAusdruck(ui)}).textContent || "";`);
    const managed = MANAGED_TEXT.some((s) => body.includes(s));
    const localRows = await zeilenZahlSelector(ui, ".yijing-ep-status");
    record(NAMEN[0]!, managed && localRows === 0, `managed-Text ${managed ? "da" : "fehlt"}, ${localRows} lokale Endpunkt-Zeilen`);
    await closeSettings(cdp, ui);
    ui = null;

    // M2 — ein Lauf nutzt den Manager-Endpunkt und das Default-Modell (kein choice.model
    // gesetzt → modelOf() faellt auf defaultModel).
    const okM2 = await laufeDeutung(cdp);
    const callsM2 = fake.chatCalls();
    const modellM2 = fake.lastModel();
    record(NAMEN[1]!, okM2 && callsM2 > 0 && modellM2 === MANAGER_DEFAULT_MODEL,
      okM2 ? `Fake-Server sah ${callsM2} POST /v1/chat/completions, Modell ${JSON.stringify(modellM2)} (erwartet ${JSON.stringify(MANAGER_DEFAULT_MODEL)})`
           : "Deutungslauf lieferte kein Ergebnis");

    // M2b — Regression C1: eine im Panel/Settings getroffene Modellwahl (settings.llm.choice)
    // darf NICHT vom Endpunkt-Default ueberschrieben werden. resolveLlmEndpoint() liest
    // choice.model bereits mit hoechster Prioritaet (src/vendor/kit/endpoint-source.ts
    // modelOf()) — dieser Punkt beweist es gegen den Fake-Server, nicht nur am Code.
    const gewaehltesModell = `${MANAGER_DEFAULT_MODEL}-CHOICE`;
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llm.choice = { ...(p.settings.llm.choice ?? {}), model: ${JSON.stringify(gewaehltesModell)} };
      await p.saveSettings();
      return { ok: true };
    `);
    const okM2b = await laufeDeutung(cdp);
    const modellM2b = fake.lastModel();
    record(NAMEN[2]!, okM2b && modellM2b === gewaehltesModell,
      okM2b ? `Fake-Server sah Modell ${JSON.stringify(modellM2b)}, erwartet ${JSON.stringify(gewaehltesModell)}`
            : "Deutungslauf lieferte kein Ergebnis");
    // choice zuruecksetzen: sonst liest M3s LOKALER Lauf denselben choice.model.
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llm.choice = {};
      await p.saveSettings();
      return { ok: true };
    `);

    // M3 — Manager "deaktivieren" (Analog zu disablePlugin) → Settings fallen auf die lokale
    // Liste zurueck, ein Lauf nutzt wieder den lokalen Fake-Endpunkt (BRAUCHT einen echten
    // Server, sonst "nichts gemessen" statt still gruen).
    await removeFakeManager(cdp);
    ui = await openSettingsTab(cdp, port);
    if (!ui) { skipped(NAMEN[3]!, "Settings-Oberflaeche nach Manager-Entfernung nicht gefunden"); return; }
    const bodyNach = await ui.cdp.evaluate<string>(`return (${wurzelAusdruck(ui)}).textContent || "";`);
    const managedNach = MANAGED_TEXT.some((s) => bodyNach.includes(s));
    const localRowsNach = await zeilenZahlSelector(ui, ".yijing-ep-status");
    await closeSettings(cdp, ui);
    ui = null;
    const settingsZurueck = !managedNach && localRowsNach > 0;

    localFake = await startFakeChatEndpoint(LOCAL_FALLBACK_MODEL);
    console.log(`  Fake-Lokal-Endpunkt: ${localFake.url}`);
    vorherEndpoints = (await cdp.evaluate<{ eps: unknown }>(`return { eps: app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.llm.endpoints };`)).eps;
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llm.endpoints = [${JSON.stringify(localFake.url)}];
      await p.saveSettings();
      return { ok: true };
    `);
    const okLokal = await laufeDeutung(cdp);
    const lokaleCalls = localFake.chatCalls();
    const modellLokal = localFake.lastModel();
    record(NAMEN[3]!, settingsZurueck && okLokal && lokaleCalls > 0,
      `managed-Text ${managedNach ? "noch da" : "weg"}, ${localRowsNach} lokale Zeilen, lokaler Lauf ${okLokal ? "ok" : "fehlgeschlagen"} (${lokaleCalls} POST /v1/chat/completions, Modell ${JSON.stringify(modellLokal)})`);
  } catch (e) {
    for (const n of NAMEN) {
      skipped(n, `Messung abgebrochen: ${(e as Error).message}`);
    }
  } finally {
    if (ui) await closeSettings(cdp, ui);
    await removeFakeManager(cdp).catch(() => null);
    if (fake) await fake.close().catch(() => undefined);
    if (localFake) await localFake.close().catch(() => undefined);
    if (vorherEndpoints !== null) {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.llm.endpoints = ${JSON.stringify(vorherEndpoints)};
        await p.saveSettings();
        return { ok: true };
      `).catch(() => null);
    }
  }
}

/** Zaehlt Treffer eines Selektors in der Settings-Oberflaeche — Analog zu `zeilenZahl`, aber
 *  mit eigenem Selektor statt `.setting-item` (fuer den lokalen-Editor-Marker). */
async function zeilenZahlSelector(ui: SettingsUi, selector: string): Promise<number> {
  return ui.cdp.evaluate<number>(`
    const wurzel = ${wurzelAusdruck(ui)};
    return wurzel ? wurzel.querySelectorAll(${JSON.stringify(selector)}).length : -1;
  `);
}

// ─── Hauptlauf ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const port = Number(arg("--port") ?? 9222);
  const vault = arg("--vault");
  const endpoint = arg("--endpoint") ?? "http://127.0.0.1:8000";
  const keinBild = argv.includes("--kein-bild");

  // Die Fixture ist dieselbe, die auch die Unit-Tests fuettert — ein zweiter Workflow
  // waere ein zweiter Wahrheitsbegriff.
  //
  // Ueber `process.cwd()`, nicht ueber `import.meta.url`: esbuild legt das Bundle als
  // `.gui-smoke.mjs` im Paket-Root ab, nicht in `scripts/` — ein Pfad relativ zum Modul
  // zeigt daher eine Ebene zu hoch und traf beim ersten Lauf ins Dach-Verzeichnis.
  // `npm run` fuehrt immer im Paket-Root aus.
  const workflowFixture = await import("node:fs/promises").then((fs) =>
    fs.readFile(`${process.cwd()}/tests/fixtures/comfy-sdxl.json`, "utf8"),
  );

  const cdp = await Cdp.attach(port, vault);
  const protokoll: string[] = [];
  await cdp.mitschnitt((zeile) => {
    if (/yijing/i.test(zeile)) protokoll.push(zeile);
  });

  // Chromium drosselt Hintergrundfenster — ohne beides misst man ein Phantom.
  await cdp.send("Page.enable");
  await cdp.send("Page.bringToFront");
  try {
    execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
  } catch {
    console.log("Hinweis: osascript-Aktivierung fehlgeschlagen — Messungen koennen leer bleiben.");
  }
  await schlaf(1500);

  // Herkunfts-Guard: laeuft dieser Smoke ueberhaupt gegen UNSEREN Build? Der Pfad kommt aus
  // der LAUFENDEN Instanz, nicht aus stagingVaultDir(REPO_NAME) — ein Treiber dockt per
  // --vault an ein beliebiges Fenster an, und ein aus der Konvention abgeleiteter Pfad pruefte
  // im Zweifel eine Datei, die mit dem Lauf nichts zu tun hat (Lesson 2026-09-02,
  // kuro-gamification). `manifest.version` taugt dafuer nicht: Store- und Repo-Build tragen
  // dieselbe Nummer.
  //
  // Die Warnung wird hier NUR gemerkt und unter der Bilanz nochmal ausgegeben — ein
  // console.warn am Anfang eines mehrminuetigen Laufs ist beim Ablesen des Ergebnisses
  // weggescrollt, und dann steht wieder ein sauber aussehendes "N/M gruen" da, das fuer den
  // Repo-Stand nichts belegt (der Zustand vom 2026-08-30, 69 von 150 Punkten).
  // Deklaration VOR dem try, sonst ist sie im finally nicht mehr sichtbar.
  let herkunftsWarnung: string | null = null;

  // Vorwert VOR dem try lesen: nur so ist er auch nach einem Abbruch im finally da.
  const originalData = await readVaultFile(cdp, DATA_PATH);
  if (originalData !== null) await writeVaultFile(cdp, DATA_RESCUE, originalData);
  // Auch der Schluesselbund-Eintrag ist Zustand des Wirts: B8 und F8 schreiben ihn, und die
  // data.json-Ruecksicherung allein liesse den Smoke-Schluessel dort stehen — beim naechsten
  // Laden GEWAENNE er gegen data.json (Schluesselbund hat Vorrang).
  const originalBund = await schluesselbund(cdp);
  const aufraeumen: string[] = [];

  try {
    // Der Guard steht FRUEH IM try — beide Haelften sind noetig und ziehen in
    // verschiedene Richtungen:
    //   im try, damit das finally laeuft. Dort haengt `cdp.close()`; ein Guard, der davor
    //     wirft, laesst den CDP-Socket offen. Das ist die Ursache des "haengenden Treibers"
    //     aus der Dach-Messung vom 2026-08-30, die faelschlich als "zu viele Fenster"
    //     gelesen wurde. (Dieser Treiber hatte den Fehler: bis 2026-09-02 stand der Aufruf
    //     VOR dem try — gemeldet von vault-rag, nachgemessen, hier behoben.)
    //   frueh, damit das finally NICHTS ZU TUN hat: `aufraeumen` ist noch leer, und
    //     `originalData` wird unveraendert zurueckgeschrieben. Wer den Guard spaeter
    //     platziert, verliert diese Haelfte.
    const vaultInfo = await cdp.evaluate<{ basePath: string; configDir: string }>(`
      return { basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };
    `);
    requireEigenerBuild(
      join(vaultInfo.basePath, vaultInfo.configDir, "plugins", PLUGIN_ID, "main.js"),
      join(process.cwd(), "main.js"),   // frisch gebaut, sonst sagt der Vergleich nichts
      (meldung) => { herkunftsWarnung = meldung; console.warn(meldung); },
    );

    await abschnittPanel(cdp);
    await abschnittMigration(cdp);
    await abschnittSettings(cdp, port, workflowFixture);
    await abschnittDeklarativ(cdp, port);
    if (!argv.includes("--kein-manager")) await pruefeManager(cdp, port);

    if (keinBild) {
      skipped("D Bildlauf", "--kein-bild gesetzt");
      skipped("E Speichern", "haengt am Bildlauf");
    } else {
      const erreichbar = await fetch(`${endpoint.replace(/\/+$/, "")}/system_stats`)
        .then((r) => r.ok)
        .catch(() => false);
      if (!erreichbar) {
        skipped("D Bildlauf", `ComfyUI unter ${endpoint} nicht erreichbar`);
        skipped("E Speichern", "haengt am Bildlauf");
      } else {
        await abschnittBild(cdp, endpoint, workflowFixture);
        await abschnittSpeichern(cdp, aufraeumen);
      }
    }
  } finally {
    console.log("\n── Aufraeumen ──");
    for (const pfad of aufraeumen) {
      await cdp.evaluate(`
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(pfad)});
        if (f) await app.fileManager.trashFile(f);
        return true;
      `);
      console.log(`  Papierkorb: ${pfad}`);
    }
    if (originalBund) {
      await schluesselbundZuruecksetzen(cdp, originalBund.wert);
      console.log(`  Schluesselbund zurueckgesetzt: ${originalBund.wert === null ? "Eintrag entfernt" : "Vorwert geschrieben"}`);
    }
    if (originalData !== null) {
      await writeVaultFile(cdp, DATA_PATH, originalData);
      await removeVaultFile(cdp, DATA_RESCUE);
      await reloadPlugin(cdp);
      const wieder = await readVaultFile(cdp, DATA_PATH);
      // Trug die Wirts-data.json noch einen Klartext-Schluessel, migriert ihn der Reload in
      // den Schluesselbund und schreibt data.json neu — das ist die Sache selbst, keine
      // Abweichung. Erkannt daran, dass nur `llm.apiKey` geleert wurde.
      const migriert = wieder !== originalData && (() => {
        try {
          const a = JSON.parse(originalData) as { llm?: { apiKey?: string } };
          const b = JSON.parse(wieder ?? "{}") as { llm?: { apiKey?: string } };
          if (!a.llm?.apiKey || b.llm?.apiKey !== "") return false;
          a.llm.apiKey = "";
          return JSON.stringify(a) === JSON.stringify(b);
        } catch { return false; }
      })();
      console.log(`  data.json zurueckgeschrieben: ${wieder === originalData ? "byte-gleich" : migriert ? "Klartext-Schluessel des Wirts in den Schluesselbund migriert (erwartet)" : "ABWEICHUNG — pruefen!"}`);
    }
    await closeSettings(cdp, null);

    if (protokoll.length) {
      console.log("\n── Renderer-Meldungen (gefiltert auf yijing) ──");
      for (const z of protokoll.slice(0, 20)) console.log(`  ${z}`);
    }

    const bestanden = checks.filter((c) => c.passed).length;
    const nachsatz = uebersprungen.length
      ? ` · ${uebersprungen.length} Abschnitt(e) NICHT gelaufen: ${uebersprungen.join(", ")}`
      : "";
    // Kein einziger Pruefpunkt = Abbruch vor der ersten Messung (typisch: der
    // Herkunfts-Guard). Das darf NICHT als Bilanz erscheinen: "0/0 bestanden" liest sich wie
    // ein bestandener Lauf, und `bestanden === checks.length` ist bei 0 === 0 wahr — der
    // exitCode waere 0 gewesen. Gerettet hat ihn bisher nur die unbehandelte Exception; wer
    // sie je faengt, haette einen "erfolgreichen" Lauf ohne eine einzige Messung.
    // Gemessen am 2026-09-02, unmittelbar nachdem der Guard ins try wanderte und das finally
    // erstmals im Abbruchfall lief — der Fix des einen Fehlers hat den anderen sichtbar
    // gemacht, der vorher hinter dem uebersprungenen finally lag.
    if (checks.length === 0) {
      console.log("\nKEIN Pruefpunkt gelaufen — der Lauf wurde abgebrochen, bevor gemessen wurde.");
      cdp.close();
      process.exitCode = 1;
    } else {
      console.log(`\nErgebnis: ${bestanden}/${checks.length} bestanden${nachsatz}`);
      for (const c of checks.filter((c) => !c.passed)) console.log(`  ❌ ${c.name} — ${c.detail}`);
      if (herkunftsWarnung) {
        console.log(`\n⚠️  Diese Bilanz ist NICHT fuer den Repo-Stand belegt: ${herkunftsWarnung}`);
      }
      cdp.close();
      process.exitCode = bestanden === checks.length ? 0 : 1;
    }
  }
}

void main();
