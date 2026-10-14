/**
 * Aufnahme-Treiber fuer die README-Bilder — faehrt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian, statt die Bilder von Hand zu klicken.
 *
 * Teilt sich die CDP-Bruecke mit `scripts/gui-smoke.ts`; Bruecke, Aufnahme-Primitive und
 * Fixture→Vault liegen zentral im Dach (`obsidian-plugins/tools/obsidian-cdp/`, seit
 * 2026-08-16 — vorher vendored unter `scripts/lib/`). Kopien waeren der Anfang derselben
 * Drift, die bei `release.mjs` zu sieben Fassungen fuehrte.
 *
 * ## Ablauf (Zweitinstanz, eigenes Profil, eigener Port — die reguläre Instanz wird nie angefasst)
 *
 * Der Port ist PFLICHT (`--port <n>` oder `SHOTS_PORT`, Wert dieses Rezepts: 9400); es gibt keinen
 * Standardport, damit ein vergessener Port nicht die reguläre Instanz (9222) trifft.
 *
 * ```bash
 * echo "$STAGING_VAULTS_DIR"                          # muss gesetzt sein (~/.zshenv)
 * npm run build && npm run shots -- --setup           # Vault aus dem Fixture bauen
 *
 * UD=/tmp/obs-test-yijing-oracle; mkdir -p "$UD"
 * lsof -nP -iTCP:9400 -sTCP:LISTEN && echo "Port belegt — anderen nehmen"
 * pgrep -f "user-data-dir=$UD" && echo "Profil belegt — $UD-w19 nehmen"
 * cp ~/Library/Application\ Support/obsidian/obsidian-<version>.asar "$UD"/
 * node -e 'const p=process.env.STAGING_VAULTS_DIR+"/yijing-oracle";require("fs").writeFileSync(process.argv[1]+"/obsidian.json",JSON.stringify({vaults:{yijing01:{path:p,ts:Date.now(),open:true}},language:"en"}))' "$UD"
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9400 &
 * #   Vertrauensdialog beim ersten Start bestaetigen; PID merken (beendet wird nur sie), Lock je Port:
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label yijing-oracle --intent "Bilder" --exclusive focus --port 9400 --ttl 600
 *
 * npm run shots -- --port 9400
 * npm run shots -- --port 9400 --only panel.png
 * npm run shots -- --list
 * ```
 *
 * ## Was hier anders ist als in der Vorlage (3d-codeblocks)
 *
 * 1. **Der Prueflings-Zustand ist gewuerfelt.** Ein Muenzwurf soll zufaellig sein, ein Bild
 *    nicht. Der Treiber ersetzt `Math.random` im Renderer fuer die Dauer des Wurfs durch
 *    einen Seed-Generator und stellt es danach zurueck — reproduzierbare Bilder, ohne im
 *    Produktionscode eine Test-Hintertuer zu oeffnen.
 * 2. **Zwei Bilder haengen an fremden Quellen** (LLM-Server; das Plugin local-image-generator mit einem Bildmodell, das im
 *    Aufnahme-Vault installiert und eingerichtet sein muss). Sie fehlen mit Ansage, statt einen Platzhalter zu zeigen:
 *    ein gestelltes Bild waere schlimmer als keines.
 * 3. **Die Aufnahmesprache ist app-weit** und gehoert deshalb ins Profil der Zweitinstanz (`obsidian.json`, Rezept oben);
 *    der Treiber prueft sie und fasst die obsidian.json der regulaeren Instanz nie an.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, env, exit } from "node:process";

import { Cdp, attachTo, openExisting, pollUntil, setAppConfig, setPluginSetting } from "../../tools/obsidian-cdp/cdp.js";
import { boxOf, capture, setWindowSize, withMetrics, writeShot, type Rect, type ShotOptions } from "../../tools/obsidian-cdp/shot.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "yijing-oracle";
const REPO_NAME = "yijing-oracle";
const PANEL_VIEW = "yijing-oracle-panel";

const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const FENSTER_BREITE = 1400;
const FENSTER_HOEHE = 950;
const PADDING = 12;

/** Steht in jedem Bild — allgemein genug, dass sie niemanden abbildet. */
const FRAGE = "A project I have been circling is on the table. Do I take it?";
/** Fester Seed: derselbe Wurf in jedem Lauf (siehe Kopfkommentar, Punkt 1). */
const SEED = 20260816;

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  /** Stellt den Zustand her und liefert den Ausschnitt — oder `null`, wenn der Zustand
   *  nicht zustande kam. Ein halbes Bild waere schlimmer als keines. */
  run(cdp: Cdp): Promise<Rect | null>;
}

const schlaf = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─── Zustand herstellen ────────────────────────────────────────────────────────────

/** Panel oeffnen und der Sidebar eine feste Breite geben — sonst haengt jedes Bild an
 *  dem Layout, das der letzte Lauf hinterlassen hat. */
async function panelOeffnen(cdp: Cdp, breite = 420): Promise<boolean> {
  await cdp.evaluate(`
    app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-view`)});
    await new Promise((r) => setTimeout(r, 800));
    // Die rechte Sidebar traegt das Panel. Ohne feste Breite ist es mal 250, mal 500 px
    // breit, und die Vorschau bricht jedes Mal anders um.
    const rechts = app.workspace.rightSplit;
    if (rechts && typeof rechts.setSize === "function") rechts.setSize(${breite});
    await new Promise((r) => setTimeout(r, 500));
    return true;
  `);
  // Das Ergebnis zaehlt: `false` macht aus dem Bild `null` (kein halbes Bild), also kein `requireUntil`, das den Lauf abbraeche.
  const da = await pollUntil<boolean>(cdp, `return Boolean(document.querySelector(".yijing-oracle .yijing-title"));`, 8000, 400);
  return Boolean(da);
}

/**
 * Einen Wurf ausloesen — mit gesetztem Seed, damit jeder Lauf dasselbe Hexagramm zeigt.
 *
 * `Math.random` wird nur fuer die Dauer des Klicks ersetzt und im selben Ausdruck wieder
 * zurueckgesetzt; ein abgebrochener Lauf hinterlaesst damit kein manipuliertes `Math`.
 */
async function wurf(cdp: Cdp, frage: string, seed: number): Promise<boolean> {
  return Boolean(await cdp.evaluate<boolean>(`
    const root = document.querySelector(".yijing-oracle");
    if (!root) return false;
    const q = root.querySelector(".yijing-question");
    if (q) { q.value = ${JSON.stringify(frage)}; q.dispatchEvent(new Event("input")); }
    const knopf = root.querySelector(".yijing-actions button");
    if (!knopf) return false;

    // mulberry32 — kurz, gleichverteilt genug fuer sechs Muenzwuerfe.
    const echt = Math.random;
    let z = ${seed} >>> 0;
    Math.random = () => {
      z = (z + 0x6D2B79F5) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try {
      knopf.click();
    } finally {
      Math.random = echt;
    }
    await new Promise((r) => setTimeout(r, 700));
    return document.querySelectorAll(".yijing-oracle .yijing-line").length === 6;
  `));
}

/** Liegt schon ein Wurf im Panel? Jeder Shot stellt seine Voraussetzung selbst her —
 *  aber ein zweiter Wurf mitten in der Reihe wuerde die Bilder untereinander
 *  widerspruechlich machen (anderes Hexagramm im Panel als in der Notiz). */
async function wurfVorhanden(cdp: Cdp): Promise<boolean> {
  return Boolean(await cdp.evaluate<boolean>(
    `return document.querySelectorAll(".yijing-oracle .yijing-line").length === 6;`,
  ));
}

async function sichereWurf(cdp: Cdp): Promise<boolean> {
  if (!(await panelOeffnen(cdp))) return false;
  if (await wurfVorhanden(cdp)) return true;
  return wurf(cdp, FRAGE, SEED);
}

/** Den n-ten Knopf einer Aktionsreihe im Panel klicken. Ueber die Position, nicht ueber
 *  die Beschriftung: die haengt an der UI-Sprache. */
async function klickPanel(cdp: Cdp, selector: string, index = 0): Promise<boolean> {
  return Boolean(await cdp.evaluate<boolean>(`
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .filter((e) => e.getBoundingClientRect().width > 1)[${index}];
    if (!el) return false;
    el.click();
    await new Promise((r) => setTimeout(r, 600));
    return true;
  `));
}

/**
 * Einen Kasten im Panel aufnahmefertig machen: in den sichtbaren Bereich scrollen und die
 * Box auf das begrenzen, was tatsaechlich gerendert ist.
 *
 * `captureBeyondViewport` verlaengert die **Seite**, nicht einen scrollenden Container.
 * Was im Panel unterhalb des Fensters liegt, existiert im Bild als weisse Flaeche — beim
 * ersten Lauf bestanden `artwork.png` und `interpretation.png` zu vier Fuenfteln daraus,
 * und das sah nach einem kaputten Ausschnitt aus statt nach einem Scroll-Problem.
 */
async function sichtbarerKasten(cdp: Cdp, selector: string): Promise<Rect | null> {
  const roh = await cdp.evaluate<string | null>(`
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => e.getBoundingClientRect().height > 1);
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 500));
    const r = el.getBoundingClientRect();
    // Unten am Fensterrand kappen: alles darunter ist nicht gezeichnet.
    const unten = Math.min(r.bottom, window.innerHeight - 4);
    return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: unten - r.y });
  `);
  if (!roh) return null;
  const box = JSON.parse(roh) as Rect;
  return box.height > 80 ? { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } : null;
}

// ─── Die Motive ────────────────────────────────────────────────────────────────────

const SHOTS: Shot[] = [
  {
    name: "panel.png",
    klasse: "detail",
    async run(cdp) {
      if (!(await sichereWurf(cdp))) return null;
      // Die Weissagungs-Vorschau ist eine <details>-Box; zugeklappt zeigt das Bild nur
      // Knoepfe. Offen ist der Auslieferungszustand nach einem Wurf.
      await cdp.evaluate(`
        const d = document.querySelector(".yijing-oracle .yijing-reading");
        if (d) d.open = true;
        await new Promise((r) => setTimeout(r, 300));
        return true;
      `);
      // Zwei Quellen fuer einen Ausschnitt: die BREITE kommt vom Blatt-Container (der
      // Inhalt endet innen, die Sidebar-Kante liegt aussen), die HOEHE vom Inhalt selbst
      // — das Panel scrollt, und der Container zeigt nur seinen sichtbaren Teil. Mit der
      // Container-Hoehe endete das Bild mitten im letzten Knopf.
      const rahmen = await boxOf(cdp, '.workspace-leaf-content[data-type="yijing-oracle-panel"]', 0);
      const inhalt = await boxOf(cdp, ".yijing-oracle", 0);
      if (!rahmen || !inhalt) return null;
      return { x: rahmen.x, y: inhalt.y - 8, width: rahmen.width, height: inhalt.height + 16 };
    },
  },
  {
    name: "reading-note.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await sichereWurf(cdp))) return null;
      // Speichern liegt in der ZWEITEN Aktionsreihe (die erste traegt den Wurf-Knopf).
      if (!(await klickPanel(cdp, ".yijing-oracle > .yijing-actions button", 1))) return null;
      await schlaf(1200);
      const pfad = await cdp.evaluate<string | null>(`
        const f = app.vault.getMarkdownFiles()
          .filter((f) => f.path.includes("Yijing"))
          .sort((a, b) => b.stat.ctime - a.stat.ctime)[0];
        return f ? f.path : null;
      `);
      if (!pfad) return null;
      if (!(await openExisting(cdp, pfad, "preview"))) return null;
      await schlaf(900);
      // Nicht die ganze Notiz: sie ist laenger als das Fenster, und ein Bild vom
      // Scrollzustand zeigt einen willkuerlichen Ausschnitt. Der obere Teil traegt die
      // Aussage (Frage, Ueberblick, Wandlung).
      const box = await boxOf(cdp, ".markdown-reading-view", 0);
      if (!box) return null;
      // Nicht stumpf nach 760 px kappen: der Schnitt landet sonst mitten in einer
      // Ueberschrift und sieht nach einem kaputten Bild aus. Die Unterkante des letzten
      // Blocks, der noch ganz hineinpasst, ist die richtige Grenze.
      const unten = await cdp.evaluate<number>(`
        const flaeche = document.querySelector(".markdown-preview-section");
        if (!flaeche) return 0;
        const grenze = ${box.y} + 760;
        let letzte = 0;
        for (const kind of flaeche.children) {
          const r = kind.getBoundingClientRect();
          if (r.height < 1) continue;
          if (r.bottom > grenze) break;
          letzte = r.bottom;
        }
        return letzte;
      `);
      const hoehe = unten > box.y + 200 ? unten - box.y + 24 : Math.min(box.height, 760);
      return { ...box, height: hoehe };
    },
  },
  {
    name: "hero.png",
    klasse: "hero",
    async run(cdp) {
      // Baut auf dem Zustand von reading-note.png auf: Notiz offen, Panel gefuellt.
      // Kommt dieser Shot einzeln (--only), stellt er ihn selbst her.
      if (!(await sichereWurf(cdp))) return null;
      const notizOffen = await cdp.evaluate<boolean>(
        `return Boolean(document.querySelector(".markdown-reading-view"));`,
      );
      if (!notizOffen) {
        const pfad = await cdp.evaluate<string | null>(`
          const f = app.vault.getMarkdownFiles()
            .filter((f) => f.path.includes("Yijing"))
            .sort((a, b) => b.stat.ctime - a.stat.ctime)[0];
          return f ? f.path : null;
        `);
        if (!pfad) return null;
        await openExisting(cdp, pfad, "preview");
        await schlaf(800);
      }
      // Ganzes Fenster: die Aussage ist die Verbindung von Panel und Notiz.
      return null_als_ganzes();
    },
  },
  {
    name: "interpretation.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await sichereWurf(cdp))) return null;
      const offen = await cdp.evaluate<boolean>(`
        const d = document.querySelector(".yijing-oracle .yijing-interpretation");
        if (!d) return false;
        d.open = true;
        await new Promise((r) => setTimeout(r, 400));
        return true;
      `);
      if (!offen) return null;
      // Fertige Antwort abwarten — der Knopf verschwindet, sobald gestreamt wird.
      if (!(await klickPanel(cdp, ".yijing-interpretation .yijing-actions button", 0))) return null;
      const fertig = await pollUntil<boolean>(
        cdp,
        `const b = document.querySelector(".yijing-interpretation-body");
         return Boolean(b && (b.textContent || "").trim().length > 400);`,
        240_000,
        2000,
      );
      if (!fertig) return null;
      // Auf RUHE warten, nicht auf eine Sekundenzahl: der Strom laeuft weiter, und ein
      // Bild mitten im Streamen zeigt den Abbrechen-Knopf statt der fertigen Antwort.
      let vorher = -1;
      for (let runde = 0; runde < 40; runde++) {
        await schlaf(2000);
        const jetzt = await cdp.evaluate<number>(
          `return (document.querySelector(".yijing-interpretation-body")?.textContent || "").length;`,
        );
        if (jetzt === vorher) break;
        vorher = jetzt;
      }
      // Denkspur zuklappen: so wird sie ausgeliefert (`<details>` ohne `open`), und
      // aufgeklappt draengt sie die Antwort — die eigentliche Aussage — aus dem Bild.
      await cdp.evaluate(`
        const d = document.querySelector(".yijing-oracle .okit-stream-reasoning");
        if (d) d.open = false;
        await new Promise((r) => setTimeout(r, 300));
        return true;
      `);
      return sichtbarerKasten(cdp, ".yijing-oracle .yijing-interpretation");
    },
  },
  {
    name: "artwork.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await sichereWurf(cdp))) return null;
      const kasten = await cdp.evaluate<boolean>(
        `return Boolean(document.querySelector(".yijing-oracle .yijing-artwork"));`,
      );
      if (!kasten) {
        console.log("      · kein .yijing-artwork — local-image-generator im Aufnahme-Vault nicht installiert oder nicht aktiv?");
        return null;
      }
      if (!(await klickPanel(cdp, ".yijing-artwork .yijing-actions button", 0))) return null;
      // Auf die LAYOUT-Hoehe warten, nicht auf den Ladezustand. `naturalWidth > 0` heisst
      // "dekodiert", nicht "eingepasst": im ersten Lauf war der Kasten zu dem Zeitpunkt
      // schon hoch, das Bild darin aber noch 70 px flach — die Aufnahme bestand zu vier
      // Fuenfteln aus Weissraum und sah nach einem kaputten Ausschnitt aus.
      const da = await pollUntil<boolean>(
        cdp,
        `const i = document.querySelector(".yijing-artwork-img");
         return Boolean(i && i.naturalWidth > 0 && i.getBoundingClientRect().height > 200);`,
        300_000,
        2000,
      );
      if (!da) return null;
      await schlaf(1200);
      return sichtbarerKasten(cdp, ".yijing-oracle .yijing-artwork");
    },
  },
];

/** Sentinel: dieser Shot nimmt das ganze Fenster auf, nicht einen Ausschnitt.
 *  `capture()` ohne Clip tut genau das — der Rueckgabewert `null` waere aber als
 *  „Zustand kam nicht zustande" gelesen worden. Deshalb ein eigener Wert. */
const GANZES_FENSTER: Rect = { x: -1, y: -1, width: -1, height: -1 };
function null_als_ganzes(): Rect {
  return GANZES_FENSTER;
}

/**
 * Der Einstellungen-Tab — seit Obsidian 1.13 ein **eigenes Fenster**.
 *
 * Es traegt keinen Workspace, deshalb waehlt `attachTo("settings", …)` die ART ueber die
 * Sache statt ueber das erste Wort des Titels ("Settings"/"Einstellungen" ist lokalisiert
 * und wechselt mit der UI-Sprache). Den VAULT waehlt es seit 2026-08-30 sehr wohl ueber
 * den Titel, naemlich ueber " - <vault> - Obsidian" — dieser Teil ist nicht lokalisiert.
 * Deshalb steht REPO_NAME als dritter Parameter da: ohne ihn ist die Wahl bei zwei
 * offenen Vaults ein Muenzwurf. Der Tab ist hoeher als jedes Fenster: aufgenommen
 * wird er in einer simulierten Fenstergroesse, zugeschnitten bis zum **letzten Kind** des
 * Inhalts-Containers — nicht auf dessen Hoehe, die ist im simulierten Fenster so gross wie
 * die Simulation und ergaebe einen langen leeren Streifen.
 */
async function settingsBild(cdp: Cdp, port: number, opts: ShotOptions): Promise<string> {
  await cdp.evaluate(`
    app.setting.open();
    await new Promise((r) => setTimeout(r, 400));
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 900));
    return true;
  `);

  const fenster = (await attachTo("settings", port, REPO_NAME)) ?? cdp;
  try {
    const da = await fenster.evaluate<boolean>(`return Boolean(document.querySelector(".yijing-ep-status"));`);
    if (!da) return "settings.png — Tab-Inhalt in keinem Fenster gefunden";

    // Erst messen, wie hoch der Tab wirklich ist, dann so hoch simulieren. Eine feste
    // Hoehe (2100) schnitt im ersten Lauf die untere Haelfte ab und fuellte sie schwarz:
    // ausserhalb des simulierten Viewports rendert Chromium nichts.
    const gebraucht = await fenster.evaluate<number>(`
      const c = document.querySelector(".vertical-tab-content");
      return c ? Math.ceil(c.scrollHeight) + 80 : 0;
    `);
    const simHoehe = Math.min(Math.max(gebraucht || 2100, 900), 8000);
    return await withMetrics(fenster, 1200, simHoehe, async () => {
      await schlaf(700);
      const box = await fenster.evaluate<string | null>(`
        const c = document.querySelector(".vertical-tab-content");
        if (!c) return null;
        const r = c.getBoundingClientRect();
        const kinder = [...c.children].filter((e) => e.getBoundingClientRect().height > 0);
        const letztes = kinder[kinder.length - 1];
        if (!letztes) return null;
        const unten = letztes.getBoundingClientRect().bottom;
        return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: unten - r.y + 16 });
      `);
      if (!box) return "settings.png — Inhalts-Container nicht gefunden";
      const png = await capture(fenster, JSON.parse(box) as Rect);
      return writeShot(fenster, "settings.png", png, { ...opts, thumb: true });
    });
  } finally {
    if (fenster !== cdp) fenster.close();
    await cdp.evaluate(`app.setting.close(); return true;`);
  }
}

// ─── Hauptlauf ─────────────────────────────────────────────────────────────────────

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const repoRoot = cwd();
  const outDir = join(repoRoot, "docs", "images");
  const fixtureDir = join(outDir, "fixture");

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    console.log(`  detail   settings.png`);
    return;
  }

  if (argv.includes("--setup")) {
    const vaultDir = stagingVaultDir(REPO_NAME);
    for (const zeile of buildVault({ repoRoot, vaultDir, fixtureDir, pluginId: PLUGIN_ID })) {
      console.log(`  ${zeile}`);
    }
    // Die Aufnahmesprache (Englisch) gehoert ins Profil der Zweitinstanz (`"language":"en"` in `$UD/obsidian.json`,
    // Rezept im Dateikopf), nie in die obsidian.json der regulaeren Instanz: --setup schreibt dort nichts.
    console.log(
      "\nJetzt die Zweitinstanz starten (Rezept im Dateikopf: eigenes Profil mit diesem Vault in obsidian.json,\n" +
        "eigener Port, z. B. 9400; die reguläre Instanz wird nicht beendet):\n" +
        "  lsof -nP -iTCP:9400 -sTCP:LISTEN   # frei?\n" +
        `  Vault: ${vaultDir}\n` +
        "Beim ersten Mal fragt Obsidian, ob es dem Vault-Autor vertraut — bestaetigen,\n" +
        "sonst laeuft das Plugin nicht und jedes Bild zeigt einen leeren Vault.",
    );
    return;
  }

  const portRoh = flag("--port") ?? env.SHOTS_PORT;
  const port = Number(portRoh);
  if (portRoh === undefined || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`--port <Zahl> (oder SHOTS_PORT) fehlt oder ist ungueltig (${JSON.stringify(portRoh)}). Den Port der eigenen Zweitinstanz angeben (Rezept im Dateikopf, z. B. 9400).`);
  }
  const nur = flag("--only");
  const llmEndpunkt = flag("--llm-endpoint") ?? "http://127.0.0.1:1234";
  const modell = flag("--model") ?? "google/gemma-4-e4b";

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.\n` +
        "Die Zweitinstanz mit diesem Vault starten (Rezept im Dateikopf); der Vault darf neben anderen offen sein.",
    );
  }
  console.log(`Verbunden auf Port ${port}.\n`);
  await cdp.mitschnitt((zeile) => console.log(`      » ${zeile}`));

  await cdp.send("Page.bringToFront");
  await schlaf(3000);

  const sprache = await cdp.evaluate<string>(
    `return document.documentElement.lang || (window.localStorage && localStorage.getItem("language")) || "en";`,
  );
  if (sprache && sprache !== "en") {
    console.log(
      `⚠️  Obsidians Oberflaeche steht auf "${sprache}", der Vertrag verlangt Englisch.\n` +
        "    Die Sprache gehoert ins Profil der Zweitinstanz (`\"language\":\"en\"` in obsidian.json, Rezept im Dateikopf).\n" +
        "    Der Lauf geht weiter — die Bilder tragen dann die falsche Sprache.",
    );
  }

  // Fenster und Wirt in einen definierten Zustand bringen.
  await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
  // Obsidians Statusleiste schwebt ueber der rechten unteren Ecke — also mitten im
  // Panel-Bild, wo sie ein fremdes Symbol hinterlaesst. Sie gehoert dem Wirt, nicht dem
  // Pruefling, und wird fuer die Aufnahme ausgeblendet (kein Neuladen noetig; die
  // Regel verschwindet mit dem naechsten Fensteraufbau).
  await cdp.evaluate(`
    let stil = document.getElementById("yijing-shots-stil");
    if (!stil) {
      stil = document.createElement("style");
      stil.id = "yijing-shots-stil";
      document.head.appendChild(stil);
    }
    stil.textContent = ".status-bar { display: none !important; }";
    await new Promise((r) => setTimeout(r, 200));
    return true;
  `);
  await setAppConfig(cdp, "readableLineLength", false);
  await setAppConfig(cdp, "showInlineTitle", false);
  // `showFrontmatter: false` aus der Fixture-app.json greift in Obsidian 1.13 nicht mehr —
  // die Properties-Tabelle stand trotzdem im Bild und fuellte zwei Drittel der
  // Notiz-Aufnahme. Der Schalter heisst jetzt `propertiesInDocument`.
  await setAppConfig(cdp, "propertiesInDocument", "hidden");

  // Einstellungen des Prueflings: Aufnahme-Zustand, nicht der Zufall des letzten Laufs.
  await setPluginSetting(cdp, PLUGIN_ID, "readingLang", "en");
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    p.settings.llm = { ...p.settings.llm, endpoints: [{ url: ${JSON.stringify(llmEndpunkt)}, model: ${JSON.stringify(modell)} }] };
    p.llm.invalidate();
    await p.saveSettings();
    for (const l of app.workspace.getLeavesOfType(${JSON.stringify(PANEL_VIEW)})) l.detach();
    await new Promise((r) => setTimeout(r, 400));
    return true;
  `);

  const opts: ShotOptions = { outDir, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH };
  let ok = 0;
  let fehlend = 0;

  for (const shot of SHOTS) {
    if (nur && shot.name !== nur) continue;
    try {
      const box = await shot.run(cdp);
      if (!box) {
        console.log(`  ✗ ${shot.name} — Zustand kam nicht zustande`);
        fehlend++;
        continue;
      }
      const png = await capture(cdp, box === GANZES_FENSTER ? undefined : box);
      console.log(`  ✓ ${await writeShot(cdp, shot.name, png, { ...opts, thumb: shot.klasse === "detail" })}`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${shot.name} — ${(err as Error).message}`);
      fehlend++;
    }
  }

  if (!nur || nur === "settings.png") {
    try {
      console.log(`  · ${await settingsBild(cdp, port, opts)}`);
    } catch (err) {
      console.log(`  ✗ settings.png — ${(err as Error).message}`);
      fehlend++;
    }
  }

  console.log(`\n${ok} Bild(er) geschrieben, ${fehlend} offen.`);
  cdp.close();
  if (fehlend) exit(1);
}

void main();
