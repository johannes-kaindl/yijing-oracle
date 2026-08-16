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

## Durchläufe

| Datum | Obsidian | Ergebnis | Gegenprobe |
|---|---|---|---|
| 2026-08-16 | 1.13.7 (Catalyst), ComfyUI 0.30.0 | **28/28** | ✅ zwei Defekte künstlich eingebaut, jeweils genau die erwarteten Punkte rot: Ausfall-Meldung ausgebaut → **27/28** (nur D4, mit dem historischen Symptom im Text); `image`-Defaults-Merge ausgebaut → **16/20** (B1, B4 direkt; C2, C3 als Folgewirkung in der UI) |

Der erste Lauf desselben Tages fand außerdem einen Mangel **im Treiber**: Ab Obsidian 1.13
sind die Einstellungen ein **eigenes Fenster**, kein Modal im Hauptfenster. Der Aufruf
`app.setting.openTabById()` gelingt, `document.querySelector(".modal.mod-settings")` bleibt im
Workspace-Fenster trotzdem `null` — die Messung greift ins Leere und liest sich wie ein
Plugin-Fehler. Der Treiber hält jetzt beide Fälle offen und leitet aus der Sache ab, welcher
vorliegt.
