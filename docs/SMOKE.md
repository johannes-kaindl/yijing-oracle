# GUI-Smoke

Was dieses Plugin gegen ein **laufendes** Obsidian prüft, statt gegen einen Mock —
und was bewusst Handarbeit bleibt.

Treiber: `scripts/gui-smoke.ts` · Lauf: `npm run smoke:gui -- --vault <name>`

## Warum es das gibt

Die 195 vitest-Fälle prüfen den puren Kern. Drei Dinge können sie strukturell nicht sehen:

1. **Die Settings-Migration in Obsidians Lade-Kette.** Der Unit-Test kennt das Objekt, nicht
   `loadData()` → `mergeSettings` → Spread-Reihenfolge gegen eine echte `data.json`.
2. **Das Umschalten der Bild-Sektion.** Ob `rerender()` die richtigen Felder tauscht, steht
   im DOM des echten Einstellungen-Fensters.
3. **Den Bildlauf gegen die echte ComfyUI.** Ein Testdoppel kann nicht 403 antworten, weil es
   keinen `Origin`-Header prüft — genau daran hing der Befund unten.

## Voraussetzung

⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
`quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
fällt nicht auf.

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
```

Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
`vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.

Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.

Obsidian muss mit offenem Debug-Port laufen. Das ist der einzige Handgriff, der Handarbeit
bleibt — die App muss dafür neu gestartet werden:

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/yijing-oracle" npm run deploy
npm run smoke:gui -- --vault <vault-name>
```

Optionen: `--port` (Default 9222) · `--endpoint` (ComfyUI, Default `http://127.0.0.1:8000`) ·
`--kein-bild` (Abschnitte D/E überspringen, Lauf dauert dann ~20 s statt ~60 s).

## Was der Lauf am Vault ändert — und zurückdreht

Er läuft im **produktiven** Vault (seit 2026-07-16 gibt es keinen Wegwerf-Vault mehr).
Deshalb:

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
| B0–B7 | Bestands-`data.json` (0.3.0-Form) lädt · `backend` fällt auf `a1111` · Endpunkt, steps/size/negativ, LLM-Liste und API-Schlüssel überleben · neue Comfy-Felder bekommen Defaults · `activeEndpoint` kommt nicht zurück | 2 |
| C1–C7 | Einstellungen-Tab öffnet · A1111-Felder · Umschalten tauscht sie · gültiger Workflow wird erkannt (4 Node-IDs) · kaputtes JSON meldet einen Fehler · leeres Feld schweigt · Zurückschalten stellt wieder her | 3, 6, 9 |
| D1–D5 | Bild-Kasten erscheint · Generieren startet · PNG kommt an · Anzeige zeigt Fortschritt **oder nennt seinen Grund** · Szenen-Satz steht darunter | 4, 7 |
| E1–E3 | Speichern legt genau eine Notiz an · Notiz trägt den Text · Bild liegt als Anhang und ist eingebettet | 8 |
| F1–F7 | Tab liefert deklarative Definitionen (und der Host übernimmt sie) · bedingte Zeilen werden weggelassen statt versteckt · die Oberfläche zieht nach einer Wertänderung nach · die Einstellungen erscheinen in Obsidians **Einstellungs-Suche** · der `display()`-Fallback zeichnet dieselbe Struktur · die maskierte API-Schlüssel-Zeile bleibt über Aliase auffindbar · das API-Schlüssel-Feld ist maskiert | — (F1–F5 neu mit 0.5.0, F6–F7 mit dem Auth-Fix 2026-09-02) |

**Nicht automatisiert** (bleibt Hand-Runde): ob die Bilder *gut* aussehen, ob sich das Panel
flüssig anfühlt, und der Export eines zweiten Workflows aus ComfyUI (Schritte 5, 10, 11 der
Handover-Note). Der Lauf protokolliert übersprungene Abschnitte ausdrücklich als
`⏭️ übersprungen`, damit eine Lücke nicht wie ein bestandener Punkt aussieht.

## Der Befund, der diesen Smoke gerechtfertigt hat

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
Seit 2026-08-16 meldet `ComfyProgressSocket` einen gescheiterten Verbindungsaufbau nach oben
und das Panel nennt den Grund. Prüfpunkt D4 misst deshalb nicht mehr „läuft der Zähler",
sondern „Zähler **oder** genannter Grund" — beides ist richtig, stumm ist falsch.

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
- **F7** — die Maskierung greift im nativen Pfad nicht. Der Unit-Test
  (`tests/api-key-field.test.ts`) misst den Renderer gegen den Obsidian-Mock; ob der Host das
  `inputEl` wirklich so übernimmt, sagt nur das laufende Programm. Gezählt werden die
  `input[type=password]` im Plugin-Tab: genau eines.

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

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
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
