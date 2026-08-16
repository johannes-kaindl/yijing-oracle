// uebernommen aus 3d-codeblocks/scripts/lib/cdp.ts, 2026-08-16
/**
 * CDP-Bruecke zu einem laufenden Obsidian — die pluginneutrale Haelfte.
 *
 * Herausgeloest aus `scripts/gui-smoke.ts` am 2026-08-15, weil ein zweiter Treiber
 * (`scripts/shots.ts`, Aufnahme der README-Screenshots) dieselbe Bruecke braucht. Eine
 * zweite Kopie waere der Anfang derselben Drift, die bei `release.mjs` zu sieben
 * Fassungen fuehrte, von denen eine kaputt war.
 *
 * Hier steht nur, was ueber JEDES Obsidian-Plugin gilt: Verbindung, Auswertung,
 * Notiz oeffnen, Blaetter aufraeumen, warten, Notices lesen. Alles, was den Prueflings
 * kennt, bleibt beim jeweiligen Treiber.
 *
 * ## Voraussetzung
 *
 * Obsidian mit offenem Debug-Port (die App muss dafuer neu gestartet werden):
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * ```
 *
 * ⚠️ Chromium drosselt das Rendering nicht-fokussierter Fenster: ohne `Page.bringToFront`
 * bleibt die View leer und man debuggt ein Phantom (CORE-TEST-02).
 */

export interface CdpTarget {
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface CdpResponse {
  id?: number;
  result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  error?: { message?: string };
}

export class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, { ok: (v: CdpResponse) => void; fail: (e: Error) => void }>();

  /** Ereignis-Empfaenger je CDP-Methode (z.B. "Runtime.exceptionThrown"). */
  private readonly lauscher = new Map<string, ((params: unknown) => void)[]>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as CdpResponse & {
        method?: string;
        params?: unknown;
      };
      if (message.id === undefined) {
        // Ereignis, kein Antwort-Frame. Bis 2026-08-15 wurden diese Frames verworfen —
        // damit war der Kanal, ueber den der Pruefling seine eigenen Fehler meldet, die
        // ganze Zeit offen und ungelesen.
        if (message.method) {
          for (const fn of this.lauscher.get(message.method) ?? []) fn(message.params);
        }
        return;
      }
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.fail(new Error(message.error.message ?? "CDP-Fehler"));
      else waiter.ok(message);
    });
  }

  /** Auf ein CDP-Ereignis hoeren. Die zugehoerige Domain muss aktiviert sein. */
  on(method: string, handler: (params: unknown) => void): void {
    const bisher = this.lauscher.get(method) ?? [];
    bisher.push(handler);
    this.lauscher.set(method, bisher);
  }

  /**
   * Konsole und Exceptions des Prueflings mitschneiden.
   *
   * Warum das fehlte und warum es zaehlt: waehrend der gesamten Fehlersuche am
   * 2026-08-15 stand dieser Kanal offen und wurde nicht gelesen. Wirft Obsidian beim
   * Oeffnen einer Notiz intern eine Exception, meldet der Treiber ohne diesen Mitschnitt
   * nur "Leseflaeche leer" — und die Ursache steht ungelesen daneben.
   */
  async mitschnitt(auf: (zeile: string) => void): Promise<void> {
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    this.on("Runtime.exceptionThrown", (p) => {
      const d = (p as { exceptionDetails?: { text?: string; exception?: { description?: string } } })
        .exceptionDetails;
      auf(`EXCEPTION ${d?.exception?.description ?? d?.text ?? "(ohne Text)"}`);
    });
    this.on("Log.entryAdded", (p) => {
      const e = (p as { entry?: { level?: string; text?: string; source?: string } }).entry;
      if (e?.level === "error" || e?.level === "warning") {
        auf(`${e.level?.toUpperCase()} [${e.source}] ${e.text}`);
      }
    });
    this.on("Runtime.consoleAPICalled", (p) => {
      const e = p as { type?: string; args?: { value?: unknown; description?: string }[] };
      if (e.type !== "error" && e.type !== "warning") return;
      const text = (e.args ?? [])
        .map((a) => String(a.description ?? a.value ?? ""))
        .join(" ")
        .slice(0, 300);
      auf(`CONSOLE.${e.type} ${text}`);
    });
  }

  /** Auf eine bekannte Debugger-URL verbinden. */
  static async connect(webSocketDebuggerUrl: string): Promise<Cdp> {
    const socket = new WebSocket(webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket-Verbindung fehlgeschlagen")), { once: true });
    });
    return new Cdp(socket);
  }

  static async attach(port: number, vault?: string): Promise<Cdp> {
    let targets: CdpTarget[];
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      targets = (await response.json()) as CdpTarget[];
    } catch {
      throw new Error(
        `Kein Debug-Port auf ${port}. Obsidian mit --remote-debugging-port=${port} neu starten ` +
          `(siehe Kopfkommentar).`,
      );
    }

    // Das Hauptfenster ist die Seite mit Obsidians app-Schema; Popouts und DevTools
    // tragen andere URLs. Ohne diese Auswahl landet man im falschen Renderer.
    const pages = targets.filter(
      (t) => t.type === "page" && t.url.startsWith("app://obsidian.md") && t.webSocketDebuggerUrl,
    );
    if (pages.length === 0) {
      const seen = targets.map((t) => `${t.type} ${t.url}`).join("\n  ") || "(keine)";
      throw new Error(`Kein Obsidian-Fenster unter den Targets gefunden:\n  ${seen}`);
    }

    // Mehrere offene Vaults sind der Normalfall, nicht die Ausnahme. Blind das erste
    // Fenster zu nehmen hiesse, den Smoke im falschen Vault zu fahren — und der
    // Fehlschlag saehe aus wie ein Plugin-Defekt ("Plugin nicht aktiv"). Der Titel
    // traegt den Vault-Namen ("<Notiz> - <Vault> - Obsidian x.y.z").
    const matching = vault
      ? pages.filter((t) => t.title.toLowerCase().includes(vault.toLowerCase()))
      : pages;
    if (matching.length === 0) {
      throw new Error(
        `Kein Fenster passt zu --vault ${vault}. Offen:\n  ${pages.map((t) => t.title).join("\n  ")}`,
      );
    }
    if (matching.length > 1) {
      throw new Error(
        `Mehrere Obsidian-Fenster offen — mit --vault <name> eines waehlen:\n  ` +
          matching.map((t) => t.title).join("\n  "),
      );
    }
    const page = matching[0];
    // Der Filter oben garantiert die URL, der Typ nicht — der Guard haelt beides zusammen.
    if (!page.webSocketDebuggerUrl) throw new Error(`Fenster ohne Debugger-URL: ${page.title}`);
    console.log(`Fenster: ${page.title}`);

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket-Verbindung fehlgeschlagen")), {
        once: true,
      });
    });
    return new Cdp(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<CdpResponse> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail });
      setTimeout(() => {
        if (!this.pending.delete(id)) return;
        fail(new Error(`Zeitüberschreitung: ${method}`));
      }, 30_000);
    });
  }

  /** Ausdruck im Renderer auswerten. Wirft die Renderer-Ausnahme weiter, statt sie
   *  als `undefined` zu verschlucken — sonst liest sich ein kaputter Ausdruck wie ein
   *  fehlgeschlagener Prüfpunkt. */
  async evaluate<T>(expression: string): Promise<T> {
    const message = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const details = message.result?.exceptionDetails;
    if (details) throw new Error(`Renderer: ${details.text ?? "Ausnahme"}`);
    return message.result?.result?.value as T;
  }

  close(): void {
    this.socket.close();
  }
}

/** Notiz schreiben und öffnen. `mode` ist Obsidians Ansichtsmodus: "preview" =
 *  Lesemodus, "source" = Editor (Live Preview). */
export async function openNote(
  cdp: Cdp,
  path: string,
  body: string,
  mode: "preview" | "source",
): Promise<void> {
  await cdp.evaluate(`
    const path = ${JSON.stringify(path)};
    const body = ${JSON.stringify(body)};
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing) await app.vault.modify(existing, body);
    else await app.vault.create(path, body);
    const file = app.vault.getAbstractFileByPath(path);
    const leaf =
      app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getLeaf(true);
    await leaf.openFile(file, { state: { mode: ${JSON.stringify(mode)} } });
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await new Promise((r) => setTimeout(r, 200));
    return true;
  `);
}

/** Notiz schliessen und neu oeffnen, ohne ihren Inhalt anzufassen — beim Prüfen einer
 *  gerade geschriebenen Zeile wäre ein `modify` genau das Gegenteil des Ziels.
 *  Der Umweg über `getMostRecentLeaf(rootSplit)` ist derselbe wie in `openNote`:
 *  nach `open-controls` ist das zuletzt benutzte Blatt die Sidebar. */
/** Eine VORHANDENE Notiz oeffnen, ohne ihren Inhalt anzufassen.
 *
 * Abgrenzung zu `openNote`: das legt an — und ueberschreibt eine bestehende Datei mit dem
 * uebergebenen Body. Fuer die Wegwerf-Notizen eines Smoke-Laufs ist das richtig; fuer eine
 * Fixture-Notiz, die etwas zeigen soll, ist es fatal. Am 2026-08-15 hat genau diese
 * Verwechslung drei Fixture-Notizen des Aufnahme-Vaults auf 0 Bytes gebracht, und jede
 * Aufnahme scheiterte danach mit „Zustand kam nicht zustande" — eine Meldung, die
 * ueberallhin zeigt, nur nicht auf die Ursache.
 */
/**
 * Verbindet auf das Fenster, das den Workspace traegt (Hauptfenster) oder auf das
 * Einstellungen-Fenster.
 *
 * Warum nicht ueber den Titel: Obsidian 1.13 gibt BEIDEN Fenstern die URL
 * `app://obsidian.md` und denselben Vault-Namen im Titel; unterschiedlich ist nur das
 * lokalisierte Praefix („Einstellungen" / „Settings"). Ein Titel-Filter waere damit
 * sprachabhaengig — und hier wurde am 2026-08-15 jede Aufnahme still falsch, weil
 * `attach` das offen gebliebene Einstellungen-Fenster erwischte und dort jede
 * Bounding-Box 0x0 mass.
 *
 * Das Kriterium ist deshalb die Sache selbst: nur das Hauptfenster hat einen Workspace.
 */
export async function attachTo(
  art: "workspace" | "settings",
  port: number,
  vault?: string,
): Promise<Cdp | null> {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = (await response.json()) as CdpTarget[];
  const pages = targets.filter(
    (t) => t.type === "page" && t.webSocketDebuggerUrl && /obsidian/i.test(t.url + t.title),
  );
  for (const ziel of pages) {
    const kandidat = await Cdp.connect(ziel.webSocketDebuggerUrl as string);
    const name = await kandidat.evaluate<string>(
      "return (window.app && app.workspace && document.querySelector('.workspace'))"
      + " ? (app.vault.getName() || '?') : '';",
    );
    const hatWorkspace = Boolean(name);
    const passt = (art === "workspace") === hatWorkspace
      // Der Vault-Name entscheidet, nicht die Reihenfolge: mehrere Vaults gleichzeitig
      // offen zu haben ist der Normalfall, und ein Lauf gegen den falschen Vault sieht
      // aus wie ein kaputtes Plugin ("keine Bloecke gefunden"). Am 2026-08-15 lief der
      // Treiber so gegen den Arbeits-Vault des Maintainers.
      && (art === "settings" || !vault || name === vault);
    if (passt) return kandidat;
    kandidat.close();
  }
  return null;
}

export async function openExisting(
  cdp: Cdp,
  path: string,
  mode: "preview" | "source",
): Promise<boolean> {
  return Boolean(await cdp.evaluate<boolean>(`
    const file = app.vault.getAbstractFileByPath(${JSON.stringify(path)});
    if (!file) return false;
    // Das zuletzt benutzte Blatt kann ABGETRENNT sein — closeExtraLeaves raeumt mit
    // detachLeavesOfType alle Markdown-Blaetter ab, und getMostRecentLeaf liefert danach
    // weiterhin eine Referenz auf eines davon. openFile() darauf laeuft ohne Fehler und
    // rendert ins Nichts: die Datei gilt als aktiv, der Lesebereich bleibt leer, und der
    // Aufrufer sucht den Fehler beim Plugin. Ein abgetrenntes Blatt hat kein parent.
    // (Kein Backtick in diesem Kommentar — er steht in einem Template-Literal.)
    // Lebendes Blatt wiederverwenden, sonst ein neues. Ein abgetrenntes Blatt nimmt
    // openFile() klaglos entgegen und rendert ins Nichts; ein frisches bei JEDEM Bild
    // zu erzwingen destabilisiert den Workspace. Der Test auf parent trennt beides.
    let leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    if (!leaf || !leaf.parent) leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file, { state: { mode: ${JSON.stringify(mode)} } });
    app.workspace.setActiveLeaf(leaf, { focus: true });

    // Auf GERENDERTEN Inhalt warten, nicht auf "Datei ist aktiv". Zwischen beidem liegt
    // Obsidians asynchrones Rendern, und in dieser Luecke meldet jede Messung ein leeres
    // Dokument: kein Codeblock, kein Block, keine Fehlermeldung. Am 2026-08-15 war das
    // die zaehste der Fallen — der Zustand schwankte zwischen Laeufen, weil er von der
    // Laufzeit des vorherigen Bildes abhing.
    const frist = 15000;
    const start = performance.now();
    while (performance.now() - start < frist) {
      const flaeche = document.querySelector(".markdown-reading-view, .cm-content");
      if (flaeche && (flaeche.textContent ?? "").trim().length > 0) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  `));
}

export async function reopenNote(cdp: Cdp, path: string, mode: "preview" | "source"): Promise<void> {
  await cdp.evaluate(`
    const current = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    if (current) current.detach();
    await new Promise((r) => setTimeout(r, 400));
    const file = app.vault.getAbstractFileByPath(${JSON.stringify(path)});
    const leaf = app.workspace.getLeaf(true);
    await leaf.openFile(file, { state: { mode: ${JSON.stringify(mode)} } });
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await new Promise((r) => setTimeout(r, 600));
    return true;
  `);
}

/** Warten, aber auf der NODE-Seite. `Cdp.send` bricht nach 30 s ab — ein `waitFor` im
 *  Renderer, das laenger wartet, reisst deshalb den ganzen Lauf ab statt den einen Punkt
 *  rot zu machen (gemessen 2026-08-14: fuenf Modelle brauchen im Kaltstart laenger).
 *  Jede Runde ist ein eigener, kurzer `Runtime.evaluate`. */
export async function pollUntil<T>(
  cdp: Cdp,
  expression: string,
  timeoutMs = 60_000,
  stepMs = 1000,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await cdp.evaluate<T | null>(expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return null;
}

/** Im Hauptbereich genau ein Blatt stehen lassen. Ohne das misst ein Punkt, der Blöcke
 *  zaehlt, die Summe aus mehreren offenen Ansichten derselben Notiz: gemessen
 *  2026-08-14 meldete "fuenf Bloecke" zehn, weil ein Split und die neu geoeffnete Notiz
 *  gleichzeitig offen standen — und die Zahl sah nach einem Plugin-Fehler aus.
 *  Nebeneffekt, der genauso wichtig ist: `getMostRecentLeaf(rootSplit)` ist danach
 *  eindeutig, sonst oeffnet die naechste Notiz womoeglich in der Sidebar. */
export async function closeExtraLeaves(cdp: Cdp): Promise<number> {
  return Number(await cdp.evaluate<number>(`
    // Alles ausser dem AKTIVEN Blatt schliessen — und zwar nach dem Oeffnen, nicht davor.
    //
    // Vorgeschichte, weil sie teuer war: iterateRootLeaves + detach() liess Splits
    // stehen; detachLeavesOfType("markdown") meldete Erfolg und aenderte nichts;
    // workspace:close-others griff nicht. Als das Abraeumen auf Container-Ebene endlich
    // wirkte, raeumte es das Blatt mit weg, in dem die Datei gerade geoeffnet worden war:
    // ein Tab in voller Breite, mit leerem Inhalt. Deshalb wird jetzt gezielt das aktive
    // Blatt verschont.
    //
    // Sichtbar wurde diese ganze Kette erst auf Screenshots des GANZEN Fensters. An den
    // Messwerten sah jede Stufe wie ein Renderer-Problem aus.
    const aktiv = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
    const alle = [];
    app.workspace.iterateRootLeaves((l) => alle.push(l));
    for (const blatt of alle) {
      if (blatt !== aktiv) blatt.detach();
    }
    await new Promise((r) => setTimeout(r, 300));

    // Leere Tab-Gruppen bleiben als schmale Spalten stehen und schnueren das aktive
    // Blatt ein. rootSplit.children sind diese Gruppen.
    const root = app.workspace.rootSplit;
    for (let runde = 0; runde < 12 && root.children.length > 1; runde++) {
      const leer = root.children.find(
        (g) => !Array.isArray(g.children) || g.children.length === 0,
      );
      if (!leer || typeof leer.detach !== "function") break;
      leer.detach();
      await new Promise((r) => setTimeout(r, 120));
    }
    await new Promise((r) => setTimeout(r, 250));
    const uebrig = [];
    app.workspace.iterateRootLeaves((l) => uebrig.push(l));
    return uebrig.length;
  `));
}


/** Eine Einstellung des Pruefling-Plugins zur Laufzeit setzen. Der Vorwert wird nicht
 *  hier gemerkt, sondern in `main` als Gesamt-Schnappschuss zurueckgeschrieben — sonst
 *  haengt die Wiederherstellung daran, dass jeder Abschnitt sauber zu Ende laeuft. */
/** Eine Obsidian-EINSTELLUNG zur Laufzeit setzen.
 *
 * Nicht ueber `.obsidian/app.json`: laeuft Obsidian bereits, haelt es seine
 * Konfiguration im Speicher und ueberschreibt die Datei beim naechsten eigenen Schreiben
 * wieder. Am 2026-08-15 blieb `readableLineLength` deshalb aktiv, obwohl das Fixture es
 * abgeschaltet hatte — der 3D-Block blieb auf Textbreite eingeschnuert und jedes Bild
 * wurde eine schmale Hochkant-Spalte.
 */
export async function setAppConfig(cdp: Cdp, key: string, value: unknown): Promise<void> {
  await cdp.evaluate(`
    app.vault.setConfig(${JSON.stringify(key)}, ${JSON.stringify(value)});
    app.workspace.trigger("css-change");
    await new Promise((r) => setTimeout(r, 400));
    return true;
  `);
}

export async function setPluginSetting(
  cdp: Cdp,
  pluginId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await cdp.evaluate(`
    const plugin = app.plugins.plugins[${JSON.stringify(pluginId)}];
    plugin.settings[${JSON.stringify(key)}] = ${JSON.stringify(value)};
    await plugin.saveSettings?.();
    await new Promise((r) => setTimeout(r, 400));
    return true;
  `);
}

/** Die zuletzt gezeigten Notices einsammeln. Sie verschwinden nach wenigen Sekunden —
 *  gelesen wird deshalb direkt nach der Aktion, nicht am Ende des Pruefpunkts. */
export async function notices(cdp: Cdp): Promise<string> {
  return cdp.evaluate<string>(`
    return [...document.querySelectorAll(".notice")].map((n) => n.textContent.trim()).join(" | ");
  `);
}
