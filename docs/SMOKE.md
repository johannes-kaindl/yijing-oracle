# GUI-Smoke

Was dieses Plugin gegen ein **laufendes** Obsidian prüft, statt gegen einen Mock —
und was bewusst Handarbeit bleibt.

Treiber: `scripts/gui-smoke.ts` · Lauf: `npm run smoke:gui -- --port <Port>` (der Port ist Pflicht)

## Warum es das gibt

Die vitest-Fälle prüfen den puren Kern. Drei Dinge können sie strukturell nicht sehen:

1. **Die Settings-Migration in Obsidians Lade-Kette.** Der Unit-Test kennt das Objekt, nicht
   `loadData()` → `mergeSettings` → Spread-Reihenfolge gegen eine echte `data.json`.
2. **Die Bild-Sektion im echten Einstellungen-Fenster.** Ob die Zeile „Bildquelle“ dem Anbieter folgt, steht im DOM, nicht im Objekt.
3. **Den Bildweg über den Kit-Vertrag `image-gen-provider`.** Bild-Kasten, Vorschau aus dem Vault, Speichern ohne Kopie und das Wegräumen ungespeicherter Bilder spielen sich im echten Vault und im echten Panel ab. Der Lauf fährt sie gegen einen Fake-Anbieter im Plugin-Register (echtes PNG, kein Server, kein Modell); der echte Anbieter ohne Modell ist D10. Die echte Bilderzeugung gehört in die Modell-Runde.

## Voraussetzung

Der Lauf gehört in eine **Zweitinstanz** mit eigenem Profil und eigenem Port; die reguläre Instanz (9222) wird weder genutzt noch beendet, ein Quit träfe die Sitzungen anderer. Der Port ist Pflicht, der Treiber hat keinen Default und bricht ohne `--port` mit Exit 2 ab. Das vollständige Rezept steht im Kopf von `scripts/gui-smoke.ts` (Profil, `.asar` der regulären Instanz, `obsidian.json` mit dem Staging-Vault und `"language":"en"`, Lock je Port). Der Vertrauensdialog und der Restricted Mode eines frischen Profils erledigt der Treiber selbst (`bereiteInstanzVor`, nur im Staging-Vault `yijing-oracle`).

```bash
UD=/tmp/obs-test-yijing-oracle; mkdir -p "$UD"
lsof -nP -iTCP:9400 -sTCP:LISTEN && echo "Port belegt — anderen nehmen"
OBSIDIAN_PLUGIN_DIR="$STAGING_VAULTS_DIR/yijing-oracle/.obsidian/plugins/yijing-oracle" npm run deploy
/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9400 &
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label yijing-oracle --intent "GUI-Smoke :9400" --exclusive focus --port 9400 --ttl 300
npm run smoke:gui -- --port 9400
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```

Optionen: `--port` (Pflicht) · `--vault` (Default `yijing-oracle`) · `--lig <Ordner>` (gebauter local-image-generator mit `main.js`, `manifest.json`, `styles.css`; ohne ihn gilt D10 als übersprungen) · `--model <id>` (M4 nimmt genau dieses auf :1234 geladene Modell; ohne Flag wird nichts angefragt und M4 ist „nichts gemessen“, weil sonst bei mehreren geladenen Modellen die Reihenfolge der Liste ein fremdes Modell träfe) · `--kein-manager` (M1–M3 und M1b gelten als übersprungen).

## Bilanz in vier Zuständen

Die letzte Zeile nennt grün · rot · übersprungen · nichts gemessen, bezogen auf die Soll-Liste `PUNKTE` im Treiber (der Nenner). **Übersprungen** heißt „in dieser Lage nicht anwendbar“ (`--lig` fehlt, `--kein-manager`, Obsidian ohne native 1.13-Settings-API). **Nichts gemessen** heißt „Gegenstand nicht erreicht“ (kein Modell in LM Studio geladen, der echte Anbieter ließ sich nicht laden, Einstellungen nicht zu öffnen, Messung abgebrochen) und setzt Exit 1, ebenso ein roter Punkt. Ein Abbruch vor der ersten Messung ist Exit 2.

## Was der Lauf am Vault ändert — und zurückdreht

Er läuft im Staging-Vault `yijing-oracle` (`$STAGING_VAULTS_DIR`), nie im Arbeits-Vault. Trotzdem setzt er jeden Zustand zurück, den er anlegt:

- Die `data.json` wird **vor** dem Lauf gelesen, zusätzlich als `data.json.smoke-rescue`
  gesichert und im `finally` zurückgeschrieben; die letzte Zeile der Ausgabe meldet, ob sie
  byte-gleich ist.
- Erzeugte Reading-Notizen und Bild-Anhänge wandern in den Papierkorb (`trashFile`), nicht
  in den Hard-Delete.
- Bricht der Prozess hart ab (Ctrl-C), liegt der Vorwert in `data.json.smoke-rescue` daneben.

## Prüfpunkte

| # | Prüft | Entspricht Handover-Schritt |
|---|---|---|
| A1–A5 | Plugin lädt · Panel öffnet · Wurf zeichnet 6 Linien · Vorschau trägt Text · Frage-Feld ist danach leer | 1 |
| B0–B9 | Bestands-`data.json` (0.3.0-Form) lädt · der `image`-Block trägt nur noch den Stil-Zusatz (B1), der Stil-Suffix des Bestands bleibt (B2) · LLM-Liste (jetzt zwei Zeilen mit URL) und API-Schlüssel (jetzt je Zeile im Schlüsselbund unter `yijing-oracle-ep-<id>`) überleben · `activeEndpoint` kommt nicht zurück · der Altwert verlässt `data.json` · das globale Modell `llm.model` wandert in die Zeilen und verschwindet (B9) | 2 |
| C1–C3 | Einstellungen-Tab öffnet (C1b: keine Zeile „Model“) · die Bild-Sektion trägt Bildquelle und Stil-Suffix und keins der Felder der früheren Eigenbau-Anbindung (C2) · der Hinweis folgt dem Anbieter: ohne ihn nennt er das Plugin, mit ihm die Quelle (C3) | 3, 6, 9 |
| D0–D10 | Ohne Anbieter fehlt der Bild-Kasten (D0) · mit Anbieter erscheint er (D1) · Generieren startet (D2) · die Datei im Vault ist ein PNG und die Vorschau zeigt sie (D3) · während des Laufs steht der Status (D4) · Szenen-Satz darunter (D5) · der Prompt trägt Szene und Stil-Suffix, Zielordner ist der Anhänge-Ordner (D6) · „Neu generieren“ räumt das ungespeicherte Bild weg (D7) · ein Fehlerwert des Anbieters wird als Meldung mit Grund gezeigt, das Bild bleibt (D8) · ein neuer Wurf räumt ein ungespeichertes Bild weg (D9) · der echte local-image-generator ohne Modell: Kasten da, Knopf meldet den Grund (D10, nur mit `--lig`) | 4, 7 (Gegenprobe: `discardArtwork` wirkungslos → D7/D9 rot) |
| E1–E4 | Speichern legt genau eine Notiz an · Notiz trägt den Text · die Note bettet die vorhandene Bilddatei ein, es entsteht keine Kopie (E3) · das gespeicherte Bild bleibt nach einem neuen Wurf (E4) | 8 |
| F1–F9 | Tab liefert deklarative Definitionen (und der Host übernimmt sie) · bedingte Zeilen werden weggelassen statt versteckt · die Oberfläche zieht nach einer Wertänderung nach · die Einstellungen erscheinen in Obsidians **Einstellungs-Suche** · der `display()`-Fallback zeichnet dieselbe Struktur · die Endpunkt-Zeile bleibt über Aliase (u. a. „token“) auffindbar · das API-Schlüssel-Feld der Zeile ist maskiert (nach „Schlüssel ändern“) · eine Eingabe landet im Schlüsselbund-Eintrag der Zeile, nicht in `data.json` · die Hilfe-Zeile steht oben | — (F1–F5 neu mit 0.5.0, F6–F7 mit dem Auth-Fix 2026-09-02, F6–F8 mit dem Verbindungs-Tausch auf Schlüssel je Zeile umgeschrieben) |
| M1–M4, M1b | LLM Endpoint Manager (Fake): M1b: ein Manager, der sich erst nach dem Zeichnen und Cachen des Tabs installiert, erscheint nach einem Tab-Wechsel (nicht nur nach Schließen und Öffnen) · die Einstellungen zeigen den Manager statt der lokalen Liste · ein Lauf nutzt seinen Endpunkt und sein Modell (auch die Wahl) · ohne Manager wieder die lokale Liste · Deutung gegen einen echten Endpunkt (braucht ein geladenes Modell, sonst „nichts gemessen“) | — |
| L1–L4 | Deutung im Strom (zentraler LLM-Stub, Kit 0.59.0): L1 der Denkblock ist sichtbar und wächst, bevor die Antwort beginnt · L2 Hochscrollen mitten im Strom wird respektiert (die Ansicht springt nicht wieder nach unten) · L3/L4 die Ansicht folgt dem Strom bis zum Ende, mit token- und mit absatzgroßen Stücken; gültig nur bei Überlauf ≥ 80 px, laufendem Strom und mindestens drei Stücken nach der Störung | — (Gegenproben: ohne `scrollEl` in `view.ts` → L3/L4 rot; Kit 0.56.0 → L4 rot; `atBottom` immer wahr → L2 rot; ohne `appendReasoning` → L1 rot) |
| L1b/L1c | Denkblock kopierbar (Kit 0.63.0): `navigator.clipboard.writeText` wird im Renderer aufgezeichnet; ein Klick auf `.okit-stream-reasoning-copy` ruft es genau einmal mit dem Anfang des Denktexts auf, der Block (`details.open`) bleibt, die Quittung `is-copied` steht · L1c Gegenprobe: lehnt `writeText` ab, darf der Knopf nicht quittieren | — (Gegenprobe ist L1c selbst) |
| P1/P1b | Pflichtpunkt Fokus-Erhalt: Tippen in die Frage, während die Deutung streamt, behält den Fokus (1,2 s Fenster); Gegenprobe: ein `blur` im selben Auslöser macht P1 rot | — |
| P2/P2b/P2c | Pflichtpunkt Erreichbarkeit: `.yijing-question`, Wurf-Knopf und Abbrechen-Knopf treffen sich nach dem Rollen selbst (EIN Rollbereich `.view-content`), bei natürlicher Höhe und im kurzen Panel (420 px); Gegenprobe: ohne Rollbalken werden 3 von 5 Elementen unerreichbar | — |
| N1–N6 | Abschnitt „Anfrage“ (Sampling-Profile, Modus creative): klappt auf · Bearbeitungen bleiben offen · gesendeter Body folgt Defaults und Einstellungen · Zurücksetzen · „Letzte Anfrage“ | — |
| V1–V9 | Verbindung (Kit 0.53.0): eine Zeile mit Klartext-Schlüssel landet nach `resolve` im Schlüsselbund und nicht in `data.json` · der Schlüssel geht als Bearer an den Endpunkt · ein Geheimnis in der Frage geht als Platzhalter an den Draht (nicht im Klartext) und kommt in der Deutung im Original zurück · eine Antwort mit Bild-URL und Platzhalter erzeugt kein `img` · ein `dataviewjs`-Block rendert als Text · V9: eine Zeile ohne Modell bekommt das erste Listenmodell über `setModel` | — (neu mit dem Verbindungs-Tausch; Gegenproben: Neutralisierung entfernt → V5/V6 rot, `redact: false` → V3/V4 rot) |
| V7–V8 | Gespeicherte Deutung: die Notiz trägt die entschärfte Form (```` ```text ```` statt `dataviewjs` und `mermaid`, kein Fernbild, auch nicht als Referenz-Definition mit Zeilenumbruch im Label), und der Zähler am Draht des Fake-Servers bleibt beim Speichern 0 | — (Gegenprobe code-kit 0.16.0 im Vendor: V7/V8 rot, `GET /pixel` 2) |
| Z-a–Z-i | Modellzeile (Kit `buildModelBar`, Welle 27; Stub mit drei Modellen): genau eine Zeile direkt unter dem Titel mit `aria-label` (a) · das Dropdown listet die Modelle plus Automatisch (b) · ein Wechsel geht als Modell an den Draht (c) · gesperrt, solange die Deutung streamt, danach frei (d) · gesperrt auch im Fenster zwischen Klick und Streambeginn (ein TCP-Vorsatz verzögert jede Anfrage um 1,5 s; der Stream-Bereich ist da noch nicht gebaut) (d2) · die Denk-Steuerung steht in der Zeile, kein zweiter Knopf (e) · bei 260 px Panelbreite läuft nichts über den Rand (f) · ein Modell- und Denkstufen-Wechsel außerhalb der Zeile erscheint in ihr, ohne dass das Panel neu zeichnet (Marke am Element bleibt) (g) · nach Wurf, Deutung und Abbruch bleibt es bei einer Zeile (h) · nach einem Start ohne Endpunkt (Frühausstieg ohne Neuzeichnen) ist die Zeile wieder frei (i) | — (Welle 27; Mutationsproben unten) |
| K-a–K-c | Linkschutz der Deutung (Kit `dom-guard`, obsidian-kit 0.70.0): im Default verlieren `obsidian://`-, `file:`- und `app:`-Links der fertigen Deutung ihr Ziel, ein https-Link behält es (a) · mit dem Schalter bleibt der `obsidian://`-Link, `file:` und `app:` gehen weiter (b) · die zwei Zeilen stehen im Einstellungen-Tab, ein Klick auf den Schalter schreibt sein Feld (c) | — (Welle 27) |

> [!bug] M1 war bis 2026-10-09 rot, ohne je gemessen zu haben
> `wurzelAusdruck(ui)` lieferte im Einstellungen-Fenster `document`, und `Document.textContent` ist immer `null`: M1 las den Leerstring, fand den Manager-Text „nicht“ und blieb rot — die Baseline führte das als vorbestehenden Plugin-Befund. Gemessen wird jetzt an `document.body`, und M1/M3 warten, bis der Tab gezeichnet ist. **Ein Prüfpunkt, der immer rot ist, hat seinen Prüfling vielleicht nie berührt** (CORE-TEST-15). Der Cockpit-Befund „Settings-Tab zeigt einen neu installierten Manager nicht sofort“ stammte aus genau dieser Fehlmessung; M1b misst den Fall (Tab gecacht, Manager danach installiert, Rückkehr von einem anderen Tab) mit gültiger Leseart und ist grün.

**Nicht automatisiert** (bleibt Hand-Runde): ob die Bilder *gut* aussehen und ob sich das Panel flüssig anfühlt. Die echte Bilderzeugung (Modell, Server) ist nur in der Modell-Runde gemessen, nie hier. Der Lauf protokolliert übersprungene Abschnitte ausdrücklich als
`⏭️ übersprungen`, damit eine Lücke nicht wie ein bestandener Punkt aussieht.

## Der Befund, der diesen Smoke gerechtfertigt hat

*Chronik: Die Eigenbau-Anbindung an ComfyUI und A1111, an der dieser Befund hing, ist seit Welle 22 entfernt (die Bilder kommen von local-image-generator). Der Befund bleibt als Begründung stehen, warum der Smoke gegen echte Gegenstellen läuft.*

**ComfyUIs Origin-Prüfung macht den Fortschritts-WebSocket aus Obsidian heraus unmöglich.**

Gemessen am 2026-08-16 gegen ComfyUI 0.30.0: Der Socket wird geöffnet und stirbt sofort mit
`close(1006)`, das Bild kommt trotzdem. Am Server nachgemessen:

| `Origin`-Header | `/system_stats` |
|---|---|
| *(keiner)* | 200 |
| `http://127.0.0.1:8000` | 200 |
| `http://localhost:8000` | **403** |
| `app://obsidian.md` | **403** |

ComfyUI verlangt, dass `Origin` dem `Host` entspricht (schon `localhost` statt `127.0.0.1`
reicht für 403). Obsidians Renderer setzt zwingend `Origin: app://obsidian.md` — der
WebSocket-Handshake wird abgewiesen. Die HTTP-Aufrufe des Plugins laufen dagegen über
`requestUrl` im **Main-Prozess** und senden gar keinen Origin; deshalb entsteht das Bild,
und nur die Anzeige bleibt blind.

Das ist keine Fehlfunktion des Plugins, sondern eine Grenze der Umgebung — wer den Balken
will, startet ComfyUI mit `--enable-cors-header "app://obsidian.md"` (ersetzt serverseitig
die Origin-Prüfung durch CORS; in dieser Umgebung nicht gegengeprüft, weil dafür der Server
des Maintainers hätte neu starten müssen).

**Was das Plugin falsch machte, war das Schweigen darüber:** Die Zeile „Bild wird generiert…"
stand minutenlang unverändert da und war von einem hängenden Lauf nicht zu unterscheiden.
Seit 2026-08-16 meldete der Fortschritts-Socket des Plugins einen gescheiterten Verbindungsaufbau nach oben
und das Panel nannte den Grund (Prüfpunkt D4 maß damals „Zähler **oder** genannter Grund": beides richtig, stumm falsch). Mit der Eigenbau-Anbindung ist auch der Socket gegangen; D4 misst jetzt, dass während des Laufs der Status der Generierung in der Zeile steht.

**Warum kein Unit-Test das fand:** Die Live-Verifikation vom 2026-08-04 lief als
Node-Skript. Node sendet keinen `Origin`. Derselbe Code, dieselbe Instanz, anderes Ergebnis —
das ist der Unterschied, für den CORE-TEST-02 (b) existiert.

## Der zweite Befund: eine Migration, deren Gewinn man nur live sehen kann

Mit 0.5.0 rendert nicht mehr das Plugin seine Einstellungen, sondern Obsidian — aus
`getSettingDefinitions()`. Kein vitest-Fall kann zeigen, was danach in der Oberfläche steht,
und alle drei Fallstricke der Umstellung sind **stille**:

1. **Bedingte Zeilen, die nie erscheinen.** Der native Renderer wertet `visible` an
   Gruppen-Items nicht aus (gemessen in `obsidian-paperize`, 2026-08-14) — bedingte Zeilen
   müssen weggelassen werden. Ein `visible: false` sähe im Code richtig aus und stünde
   trotzdem in der Oberfläche. **F2** misst die Definition selbst, nicht das DOM.
2. **Ein Tab, der nicht nachzieht.** Beim Öffnen rendert der Host die beim `addSettingTab`
   gecachten Definitionen und ruft weder `display()` noch `getSettingDefinitions()`
   (gemessen in `audio-interface`, 2026-08-15). **F3** schaltet den Frontmatter-Schalter über
   denselben Eintrittspunkt, den auch ein Klick nimmt, und zählt die Zeilen: 48 → 41 → 48.
3. **Zeilen, die rendern, aber nicht suchbar sind** — der einzige Grund, aus dem die
   Umstellung überhaupt lohnt. **F4** tippt in Obsidians Einstellungs-Suche und zählt die
   Treffer, die dem Plugin zugeordnet sind. Der Suchbegriff kommt aus der eigenen Definition
   (`defs[0].items[0].name`), nicht aus einer festen Zeichenkette — sonst misst der Treiber
   die UI-Sprache.

**F5 misst den anderen Pfad — und fand sofort etwas.** Unter 1.13 ruft der Host `display()`
nie, der Fallback für ältere Versionen liefe also ungeprüft mit; ein direkter Aufruf zeichnet
ihn in denselben Container. Der erste Lauf meldete 48 gegen 49 Zeilen. Ursache: eine
**Definition ohne Namen und ohne Control** (die Erklärzeile über den Callouts, nur `desc`)
wird vom nativen 1.13-Renderer **stillschweigend übersprungen**, während der Fallback-Walker
sie zeichnet. Das war ein echter Regress gegenüber 0.4.0 — behoben in 0.5.1, indem die Zeile
eine `render`-Hatch wurde, die beide Pfade zeichnen. **Merksatz: eine Zeile ohne Regler
braucht im deklarativen Modell trotzdem einen Renderer.**

**Die Gegenprobe, die den Umbau rechtfertigt** (2026-08-16, gegen dieselbe laufende Instanz,
0.4.0 aus git deployt und wieder zurück):

| Stand | `tab.settingItems` | Treffer für „Reading-Sprache" in der Einstellungs-Suche |
|---|---|---|
| 0.4.0 (nur `display()`) | 0 | **0** |
| 0.5.0 (deklarativ) | 7 | **1** |

Die Store-Warnung `prefer-setting-definitions` beschrieb also keinen Formfehler, sondern
einen realen Verlust: unter Obsidian ≥ 1.13 waren sämtliche Einstellungen dieses Plugins über
die Suche **nicht auffindbar**.

Ein zweiter Fund aus demselben Lauf, für künftige Treiber: das ausgelagerte
Einstellungen-Fenster hat einen **eigenen JS-Kontext** und kennt kein `app` — ein
`app.setting.activeTab` dort wirft `app is not defined`. Definitionen misst man im
Hauptfenster, das DOM im zweiten.

**F6/F7 messen die eine Zeile, die nicht deklarativ sein darf.** Obsidians Definitions-API kennt
keinen Passwort-Typ — `SettingTextControl` trägt genau `type: 'text'` und `placeholder` (gemessen
an `obsidian.d.ts` 1.13.1). Ein Feld, das einen API-Schlüssel trägt, muss aber maskieren, also ist
diese Zeile eine `render`-Hatch. Damit stehen zwei stille Fehlschläge im Raum, und beide träfen
den Nutzer hart:

- **F6** — die Zeile fällt aus der Einstellungs-Suche. Auffindbarkeit war der ganze Ertrag von
  0.5.0; sie an einer Zeile wieder zu verlieren, ohne es zu merken, wäre der teuerste Rückschritt.
  Gesucht wird nach **„token"**: der Begriff steht in keinem der vier Strings der Zeile
  (`name`/`desc` in EN und DE), sondern nur in ihren `aliases`. Ein Treffer beweist deshalb, dass
  Aliase durchschlagen — eine Suche nach „API" hätte auch angeschlagen, wenn die Definition gar
  nichts von der Zeile wüsste.
  > [!bug] Dieser Prüfpunkt war beim Erstlauf blind — und der Erstlauf war grün
  > Zuerst suchte F6 nach **„bearer"**. Er blieb grün, obwohl die Gegenprobe die `aliases`
  > entfernt hatte: derselbe Commit hatte eine Erklärzeile ergänzt, die
  > „Authorization: Bearer …" enthält — der Punkt maß die **Beschreibung** statt der Aliase.
  > Ohne Sabotage hätte ein grünes 27/27 den blinden Prüfpunkt beglaubigt. **Ein Prüfpunkt, der
  > einen Suchbegriff verwendet, muss belegen, dass der Begriff nur an der geprüften Stelle
  > steht** — und der Beleg ist die Gegenprobe, nicht die Behauptung im Kommentar.
- **F7** — die Maskierung greift nicht. Seit dem Verbindungs-Tausch zeichnet das Kit die Endpunkt-Zeilen (`okit-ep-row`): eine Zeile mit gespeichertem Schlüssel zeigt „saved“ mit Stift („Change key“), das Feld erscheint erst nach dem Klick. F7 klickt den Stift und zählt die `input[type=password]` in der ersten Zeile: genau eines. Der Aliase-Teil (F6) bleibt als Test in `tests/llm-section-connection.test.ts`; ob der Host das `inputEl` wirklich so übernimmt, sagt nur das laufende Programm.

> [!warning] Wer im Settings-Tab **Text** misst, braucht kein `\b`
> Aus `markdown-presentation` (2026-09-02, im Austausch am CDP-Lock): `textContent` klebt die
> Texte benachbarter Knoten **ohne Trenner** aneinander — im Tab steht dann etwa
> `…-Keysettings.themesFolder.name`. Ein Regex mit `\b` vor dem Schlüssel-Präfix findet dort
> **nichts**, obwohl der rohe Schlüssel sichtbar im Fenster steht: zwischen „y" und „s" ist keine
> Wortgrenze. Der Prüfpunkt war grün, während der Defekt danebenstand; gefunden hat es nur die
> Gegenprobe. F6/F7 sind davon **nicht** betroffen (F7 liest `input.type`, F6 zählt
> `.setting-search-result-item`) — aber der nächste textmessende Prüfpunkt wäre es.

**Warum der Guard abbricht statt zu warnen — und warum er FRÜH IM `try` steht.** Ein Lauf gegen
fremden Code soll keine Bilanz erzeugen, die jemand später zitiert; deshalb wirft der
`fremd`-Zweig, statt eine Zeile zu drucken, die im Protokoll untergeht.

Bei der Platzierung ziehen zwei Anforderungen in verschiedene Richtungen, und **man braucht
beide**:

- **im `try`**, damit das `finally` läuft — dort hängt `cdp.close()`. Ein Guard, der davor wirft,
  lässt den CDP-Socket offen. Das ist die Ursache des „hängenden Treibers" aus der Dach-Messung
  vom 2026-08-30, die damals fälschlich als „zu viele Fenster" gelesen wurde.
- **früh**, damit das `finally` nichts zu tun *hat*: `aufraeumen` ist noch leer, `originalData`
  wird unverändert zurückgeschrieben. Wer den Guard später platziert, verliert diese Hälfte.

> [!bug] Dieser Treiber hatte den Fehler — und die Doku hat ihn als Vorzug beschrieben
> Bis zum 2026-09-02 stand der Aufruf **vor** dem `try`, und genau hier stand als Begründung,
> das sei gut so, weil „nichts aufzuräumen" sei. Die Schlussfolgerung stimmte, die Begründung
> war falsch, und der Nebeneffekt (offener Socket beim Abbruch) war unsichtbar — der
> Positivfall-Lauf desselben Tages ist mit offenem Socket beendet worden. Gemeldet von
> `vault-rag`, an beiden Treibern nachgemessen (dort steht der Aufruf **im** `try`, Z. 265 nach
> `try {` in Z. 242), hier behoben. **Eine Begründung, die zufällig zum richtigen Ergebnis
> führt, ist keine geprüfte Begründung** — sie trägt beim nächsten Nachbau nicht mit.
>
> **Der Fix hat sofort einen zweiten Fehler freigelegt, der hinter dem ersten lag.** Sobald das
> `finally` im Abbruchfall lief, druckte es „Ergebnis: **0/0 bestanden**" — und
> `bestanden === checks.length` ist bei `0 === 0` wahr, also wurde `process.exitCode = 0`
> gesetzt. Gerettet hat den Lauf nur die unbehandelte Exception; wer sie je fängt, hätte einen
> „erfolgreichen" Lauf ohne eine einzige Messung. Jetzt: `KEIN Pruefpunkt gelaufen — der Lauf
> wurde abgebrochen, bevor gemessen wurde`, Exit 1. **Ein übersprungener Codepfad versteckt die
> Fehler, die in ihm stecken** — der zweite war zwei Wochen unsichtbar, weil der erste ihn nie
> zur Ausführung kommen ließ.


## Mutationsproben der Modellzeile und des Linkschutzes (Welle 27, 2026-10-25)

Je eine Änderung im Quelltext, ein voller Lauf, danach zurückgestellt. Ergebnis „n von m“ = rote Punkte, die dazugehören, von allen roten.

| Probe | Ergebnis |
|---|---|
| `bar.update()` nach `starting = true` entfernt | Z-d2 rot, 1 von 1 |
| `bar.update()` im `finally` entfernt (Frühausstieg) | Z-i rot, 1 von 1 |
| Nachziehen in `saveSettings` entfernt | Z-g rot, 1 von 1 |
| `disabled` der Zeile entfernt | Z-d und Z-d2 rot, 2 von 2 |
| `setModel` der Zeile wirkungslos | Z-c rot, 1 von 1 |
| `destroy()` der alten Zeile vor dem Neubau entfernt | Smoke nicht unterscheidbar (0 rot): `root.empty()` entfernt die alte Wurzel im Panel ohnehin; die Unit-Probe (a) ist rot, 1 von 1 |
| Wächter durch `MarkdownRenderer.render` ersetzt | K-a und K-b rot, 2 von 2 |
| `allowObsidianLinks` im Aufruf fest `false` | K-b rot, 1 von 1 |
| Gruppe „Links und Bilder in Antworten“ aus dem Tab entfernt | K-c rot, 1 von 1 |

Die Unit-Tests (`tests/model-row.test.ts`, `tests/link-settings.test.ts`) fahren eigene Proben: acht an der Modellzeile (alle rot), fünf an den Link-Einstellungen (alle rot).

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
| 2026-10-25 (2) | 1.14.5, Pin obsidian-kit 0.70.1 / code-kit 0.37.5, Lock `focus` bestätigt | **87 grün · 0 rot · 1 übersprungen (D10 ohne `--lig`) · 1 nichts gemessen (M4 ohne `--model`) von 89**, gleiche Bilanz wie vor dem Pin | — Pin-Patch ohne Verhaltensänderung für dieses Plugin (kein `onResolved`, kein `locked`); keine neue Probe nötig |
| 2026-10-25 | 1.14.5, Pin obsidian-kit 0.70.0 / code-kit 0.37.5, Lock `focus` bestätigt | **87 grün · 0 rot · 1 übersprungen (D10 ohne `--lig`) · 1 nichts gemessen (M4 ohne `--model`) von 89** (Baseline vor der Welle 74/0/1/1 von 76; neu Z-a–Z-i und K-a–K-c) | ✅ Mutationsproben der Modellzeile und des Linkschutzes: Tabelle oben. Die Proben liefen ohne bestätigten Lock (Skriptfehler, behoben), der Lauf in dieser Zeile unter bestätigtem Lock |
| 2026-09-02 (3) | 1.13.7 (Catalyst), ohne Bildlauf | **27/27 · 2 Abschnitte nicht gelaufen** | ✅ Guard-Platzierung korrigiert (vor dem `try` → früh **im** `try`) und verifiziert: der Abbruchlauf zeigt jetzt die Aufräum-Ausgabe, `cdp.close()` läuft. Dabei fiel die `0/0 bestanden`-Bilanz auf (Exit wäre 0 gewesen) — behoben, Abbruch meldet jetzt „KEIN Pruefpunkt gelaufen“ mit Exit 1. Bestätigungslauf danach: 27/27, `npm-exit=0` |
| 2026-09-02 (2) | 1.13.7 (Catalyst), ohne Bildlauf | **27/27 · 2 Abschnitte nicht gelaufen** | ✅ **Herkunfts-Guard im Positivfall gesehen**, mit dem eigenen Einbau: eine Kommentarzeile an die Vault-`main.js` (gültiges JS, das Plugin lief weiter) → Abbruch mit Byte- und sha1-Vergleich, **kein Prüfpunkt lief**. 101 Bytes reichten. Danach deployt → wieder still, 27/27. Damit ist sein Schweigen ein Messwert: „Build ist echt“, nicht „Guard tot“ |
| 2026-09-02 | 1.13.7 (Catalyst), ohne Bildlauf (`--kein-bild`) | **27/27** | ✅ zwei Sabotagen **einzeln** gefahren, je genau ein Punkt rot und kein zweiter mit: `aliases` entfernt → F6 rot (26/27), Maskierung entfernt → F7 rot (26/27). **F6 war dabei zuerst blind** (s. o.) — der Fehler fiel nur auf, weil der Punkt trotz Sabotage grün BLIEB. Herkunft belegt: Drei-Datei-Hash vor jedem Lauf + Guard still. Staging-Vault `yijing-oracle`, nicht Pallas |
| 2026-08-16 (3) | 1.13.7 (Catalyst), ComfyUI 0.30.0 | **33/33** | ✅ F5 hatte im ersten Lauf einen echten Befund (48 ≠ 49 Zeilen, s. oben) — nach dem Fix beide Pfade 49 |
| 2026-08-16 (2) | 1.13.7 (Catalyst), ComfyUI 0.30.0 | **32/32** | ✅ Vorher-Messung gegen den 0.4.0-Stand: `settingItems` 0 statt 7, 0 Suchtreffer statt 1 (Tabelle oben). F4 zusätzlich gegen einen Unsinns-Begriff: 0 Treffer |
| 2026-08-16 | 1.13.7 (Catalyst), ComfyUI 0.30.0 | **28/28** | ✅ zwei Defekte künstlich eingebaut, jeweils genau die erwarteten Punkte rot: Ausfall-Meldung ausgebaut → **27/28** (nur D4, mit dem historischen Symptom im Text); `image`-Defaults-Merge ausgebaut → **16/20** (B1, B4 direkt; C2, C3 als Folgewirkung in der UI) |

Der erste Lauf desselben Tages fand außerdem einen Mangel **im Treiber**: Ab Obsidian 1.13
sind die Einstellungen ein **eigenes Fenster**, kein Modal im Hauptfenster. Der Aufruf
`app.setting.openTabById()` gelingt, `document.querySelector(".modal.mod-settings")` bleibt im
Workspace-Fenster trotzdem `null` — die Messung greift ins Leere und liest sich wie ein
Plugin-Fehler. Der Treiber hält jetzt beide Fälle offen und leitet aus der Sache ab, welcher
vorliegt.
