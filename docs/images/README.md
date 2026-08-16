# Aufnahme-Vertrag für die README-Bilder

Was jedes Bild zeigen **muss**, damit es seinen Zweck erfüllt — und wie es entsteht.
Erzeugt von `scripts/shots.ts` (`npm run shots`), geprüft von `npm run shots:check`.

Der Bild-Standard (Klassenbreiten, Budgets, Einbettungsform) ist workspace-weit und wird
hier **nicht** wiederholt: `_docs/readme/readme-spec.json`, Block `images`.

## Motive

| Datei | Klasse | referenziert von | muss zeigen |
|---|---|---|---|
| `hero.png` | hero | `README.md`, `README.de.md` | Das ganze Fenster: eine gespeicherte Befragung als Notiz im Lesemodus, rechts das Orakel-Panel mit demselben Wurf. Die Aussage ist die Verbindung — Orakel **und** Vault-Notiz, nicht nur ein Panel. |
| `panel.png` | detail | `README.md`, `README.de.md` | Das Panel allein: Frage-Feld, Wurf-Knopf, das Hexagramm als sechs Linien, Name und Zeichen, die Weissagungs-Vorschau, Speichern-Knöpfe. Hoch und schmal — als Vorschaubild eingebettet. |
| `reading-note.png` | feature | `README.md`, `README.de.md` | Die erzeugte Notiz im Lesemodus, so weit sichtbar, dass die Gliederung erkennbar ist: Frage, Überblick, Wandlung, die Callouts für Ursprung und wandelnde Linien. |
| `interpretation.png` | feature | `README.md`, `README.de.md` | Den Deutungs-Kasten im Panel mit einer **fertigen** Antwort eines lokalen Modells, darüber die aufklappbare Denkspur. Belegt, dass die Deutung im Panel lebt und nicht in einem Modal. |
| `artwork.png` | feature | `README.md`, `README.de.md` | Den Bildmeditations-Kasten mit einem **echt erzeugten** Bild, darunter den Szenen-Satz und den Knopf zum Neu-Generieren. |
| `settings.png` | detail | `README.md`, `README.de.md` | Den Einstellungen-Tab ganz, von der Sprachwahl bis zur Bildgenerierung — die Länge ist die Aussage. Als Vorschaubild verlinkt auf die Vollauflösung. |

## Reproduktionsrezept

```bash
export STAGING_VAULTS_DIR="$HOME/StagingVaults"   # beliebiges Verzeichnis ausserhalb des Repos   # einmalig
npm run build && npm run shots -- --setup                    # Vault aus dem Fixture bauen

osascript -e 'quit app "Obsidian"'                           # Handarbeit: Debug-Port
open -a Obsidian --args --remote-debugging-port=9222
#   ... den Aufnahme-Vault öffnen und einmalig als vertrauenswürdig markieren

npm run shots                 # alles aufnehmen
npm run shots -- --only panel.png
npm run shots -- --list       # Vertrag anzeigen
```

### Was der Lauf voraussetzt

- **ComfyUI** unter `http://127.0.0.1:8000` mit einem SDXL-Workflow — `artwork.png` zeigt
  ein echt erzeugtes Bild, kein Platzhalter. Fehlt der Server, fehlt das Bild (und
  `shots:check` meldet es).
- **Ein OpenAI-kompatibler LLM-Endpunkt** unter `http://127.0.0.1:1234` für
  `interpretation.png`. Dasselbe gilt: kein Server, kein Bild.
- Die Aufnahme-Sprache ist **Englisch**. Sie ist app-weit, nicht vault-weit — der Treiber
  stellt sie um und **nach dem Lauf wieder zurück**, sonst startet der Arbeits-Vault des
  Maintainers auf Englisch.

### Warum die Bilder trotz Zufallswurf reproduzierbar sind

Ein Münzwurf ist zufällig, und ein Bild soll es nicht sein. Der Treiber ersetzt deshalb für
die Dauer des Wurfs `Math.random` im Renderer durch einen Seed-Generator (`mulberry32`) und
stellt es danach zurück. Jeder Lauf zeigt damit dasselbe Hexagramm — ohne dafür im
Produktionscode eine Test-Hintertür zu brauchen.

Die Frage lautet in allen Bildern gleich und ist bewusst allgemein gehalten:
*„A project I have been circling is on the table. Do I take it?"*

### Beispieldaten

Der Aufnahme-Vault (`docs/images/fixture/`) enthält zwei Notizen: einen Journal-Eintrag,
in den eine Befragung verlinkt wird, und eine Referenz zur Drei-Münzen-Methode. Beides ist
erfunden und englisch — keine echten Namen, Orte oder Daten. Der Vault aktiviert **nur**
dieses Plugin, damit keine fremden Ribbon-Icons in die Bilder geraten.

## Befunde am Prüfling, die bei der Aufnahme auffielen

_(Hier stehen Dinge, die beim systematischen Durchgehen der Zustände sichtbar wurden und
nicht zur Bebilderung gehören. Leer = nichts gefunden.)_

- **2026-08-16:** Der Fortschritts-Balken der Bildmeditation erscheint gegen eine
  Standard-ComfyUI nie — deren Origin-Prüfung weist den WebSocket aus dem Obsidian-Renderer
  ab. Gefunden vom GUI-Smoke am selben Tag, behoben (das Panel nennt den Grund jetzt);
  Einzelheiten in `docs/SMOKE.md`.
- **2026-08-16, beim Aufnehmen von `interpretation.png`: die KI-Deutung funktioniert gegen
  ein unverändertes LM Studio überhaupt nicht.** Der Stream läuft als `XMLHttpRequest` im
  Renderer und trägt damit `Origin: app://obsidian.md`; ohne aktiviertes CORS antwortet der
  Server auf den Preflight mit 400, und im Panel stand „Deutung fehlgeschlagen — prüfe den
  Endpunkt in den Einstellungen". **Genau dieser Rat führt in die Irre**, denn der
  Verbindungstest ist grün: er läuft über Obsidians `requestUrl` im Main-Prozess und sendet
  gar keinen Origin. Dasselbe Muster wie beim ComfyUI-WebSocket, nur trifft es hier nicht die
  Anzeige, sondern das Feature. Behoben: eigener Fehlertyp in `sse.ts`, eigene Meldung, die
  CORS nennt (`notice.llmBlocked`), und die Voraussetzung steht jetzt in beiden READMEs.
  Das Bild selbst entstand mit `lms server start --cors`; der Server wurde danach wieder
  ohne CORS gestartet.
