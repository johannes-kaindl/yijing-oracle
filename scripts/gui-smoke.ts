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

const PLUGIN_ID = "yijing-oracle";
/** manifest.json → name. Nicht lokalisiert — taugt als Anker in der Einstellungs-Suche. */
const PLUGIN_NAME = "Yijing Oracle";
/** src/obsidian/view.ts: VIEW_TYPE_YIJING. */
const PANEL_VIEW = "yijing-oracle-panel";
const DATA_PATH = `.obsidian/plugins/${PLUGIN_ID}/data.json`;
/** Sicherungskopie fuer den Fall, dass der Lauf hart abbricht (Ctrl-C, Absturz). */
const DATA_RESCUE = `.obsidian/plugins/${PLUGIN_ID}/data.json.smoke-rescue`;

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
function skipped(name: string, reason: string): void {
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

  // Fall 1 (bis 1.12): Modal im selben Fenster.
  const alsModal = await cdp.evaluate<boolean>(
    `return Boolean(document.querySelector(".modal.mod-settings .yijing-ep-status"));`,
  );
  if (alsModal) return { cdp, praefix: ".modal.mod-settings ", eigenesFenster: false };

  // Fall 2 (ab 1.13): eigenes Fenster. Das Kriterium ist nicht der Titel (der ist
  // lokalisiert), sondern die Sache: kein Workspace, aber unsere Sektion im DOM.
  const zweit = await attachTo("settings", port);
  if (!zweit) return null;
  const da = await zweit.evaluate<boolean>(`return Boolean(document.querySelector(".yijing-ep-status"));`);
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

  // Vorwert VOR dem try lesen: nur so ist er auch nach einem Abbruch im finally da.
  const originalData = await readVaultFile(cdp, DATA_PATH);
  if (originalData !== null) await writeVaultFile(cdp, DATA_RESCUE, originalData);
  const aufraeumen: string[] = [];

  try {
    await abschnittPanel(cdp);
    await abschnittMigration(cdp);
    await abschnittSettings(cdp, port, workflowFixture);
    await abschnittDeklarativ(cdp, port);

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
    if (originalData !== null) {
      await writeVaultFile(cdp, DATA_PATH, originalData);
      await removeVaultFile(cdp, DATA_RESCUE);
      await reloadPlugin(cdp);
      const wieder = await readVaultFile(cdp, DATA_PATH);
      console.log(`  data.json zurueckgeschrieben: ${wieder === originalData ? "byte-gleich" : "ABWEICHUNG — pruefen!"}`);
    }
    await closeSettings(cdp, null);

    if (protokoll.length) {
      console.log("\n── Renderer-Meldungen (gefiltert auf yijing) ──");
      for (const z of protokoll.slice(0, 20)) console.log(`  ${z}`);
    }

    const bestanden = checks.filter((c) => c.passed).length;
    console.log(`\nErgebnis: ${bestanden}/${checks.length} bestanden`);
    for (const c of checks.filter((c) => !c.passed)) console.log(`  ❌ ${c.name} — ${c.detail}`);
    cdp.close();
    process.exitCode = bestanden === checks.length ? 0 : 1;
  }
}

void main();
