# Yijing Oracle

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/yijing-oracle/blob/main/LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](https://github.com/johannes-kaindl/yijing-oracle/blob/main/LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/yijing-oracle?label=release)](https://github.com/johannes-kaindl/yijing-oracle/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.11.4%2B%20·%20Desktop%20%26%20Mobil-7c3aed)

> 🇩🇪 Deutsch · [🇬🇧 English](https://github.com/johannes-kaindl/yijing-oracle/blob/main/README.md)

> **Hinweis:** Diese Übersetzung folgt der englischen [`README.md`](https://github.com/johannes-kaindl/yijing-oracle/blob/main/README.md).
> Bei Abweichungen gilt die englische Fassung.

Das *I Ging* (Yijing) in Obsidian befragen. Ein Drei-Münzen-Orakel mit den klassischen
Hexagramm-Texten von Richard Wilhelm — und jede Befragung wird als **Notiz im Vault**
gespeichert: durchsuchbar, verlinkbar, Teil deines Denkens. Local-first, keine Cloud,
kein Konto.

> Native Obsidian-Neuimplementierung des Orakel-Kerns aus dem
> [Yijing-Web-/App-Projekt](https://git.jkaindl.de/jkaindl/Yijing). Keine Portierung des
> Ganzen — ein fokussiertes Plugin, in dem der Vault das Orakel-Journal ist.

<p align="center"><img src="https://raw.githubusercontent.com/johannes-kaindl/yijing-oracle/main/docs/images/hero.png" width="600" alt="Eine gespeicherte Befragung als Notiz in Obsidian, daneben das Orakel-Panel mit demselben Hexagramm"></p>

## Features

- **Seitenleisten-Panel** — Frage stellen (oder nicht), Münzen werfen, Hexagramm-Figur,
  Wandellinien und Zielhexagramm sehen, dann speichern.
- **Befragungen als Notizen** — jeder Wurf wird eine Markdown-Notiz mit Frontmatter
  (`hexagram`, `changing_lines`, `resulting`, `question`, …) in einem Ordner deiner
  Wahl, oder an der Cursorposition der aktuellen Notiz eingefügt.
- **Zweisprachig DE + EN** — Hexagramm-Texte und Oberfläche auf Deutsch oder Englisch;
  folgt der Obsidian-Sprache oder einer festen Einstellung.
- **Register** — klassische (Wilhelm) oder geschlechtsneutrale Formulierung.
- **Zwei direkte Befehle** — *In neue Notiz werfen* und *An der Cursorposition werfen* —
  zusätzlich zum Panel.
- **KI-Deutung (optional, lokal)** — eine Deutung von einem lokalen
  OpenAI-kompatiblen LLM-Server streamen (LM Studio, Ollama, …); System-Prompt,
  Endpunkte und Reasoning-Anzeige sind konfigurierbar. Aus, bis du einen Endpunkt
  einträgst.
- **Meditationsbild (optional, lokal)** — ein Bild je Befragung aus dem kuratierten
  Motiv des Hexagramms erzeugen, über einen lokalen A1111-kompatiblen Bild-Server
  (Draw Things, A1111, Forge, …). Vorschau im Panel, Einbettung in der Notiz. Aus, bis
  du einen Endpunkt einträgst — Einrichtung siehe
  [docs/image-generation.md](https://github.com/johannes-kaindl/yijing-oracle/blob/main/docs/image-generation.md).

## Voraussetzungen

- **Obsidian 1.11.4+** (Desktop oder Mobil).
- Sonst nichts für das Orakel selbst — die Hexagramm-Daten sind mitgeliefert, das
  Werfen funktioniert vollständig offline.
- **Optional, für die KI-Deutung:** ein OpenAI-kompatibler lokaler Server (z.B.
  [LM Studio](https://lmstudio.ai) oder [Ollama](https://ollama.com)). Endpunkt und
  Modell (eins je Endpunkt-Zeile) werden in den Plugin-Einstellungen gesetzt. CORS am Server ist optional: Obsidians Renderer sendet `Origin: app://obsidian.md`, und die meisten lokalen Server weisen das standardmäßig ab. Das Plugin wiederholt die Anfrage dann ohne Streaming, die Deutung erscheint am Stück statt Wort für Wort. Für den Live-Stream CORS aktivieren (LM Studio: `lms server start --cors`).
- **Optional, für Meditationsbilder:** ein A1111-kompatibler Bild-Server (z.B.
  [Draw Things](https://drawthings.ai) mit aktiviertem API-Server). Siehe die
  [Einrichtungsanleitung](https://github.com/johannes-kaindl/yijing-oracle/blob/main/docs/image-generation.md).

Beide optionalen Funktionen bleiben aus, bis ein Endpunkt konfiguriert ist. Nichts
verlässt jemals deinen Rechner.

## Installation

### Community-Plugins (empfohlen)

In **Einstellungen → Community-Plugins → Durchsuchen** nach **Yijing Oracle** suchen,
dann **Installieren** und **Aktivieren**.

### Manuell

`main.js`, `manifest.json` und `styles.css` aus dem
[neuesten Release](https://github.com/johannes-kaindl/yijing-oracle/releases) herunterladen,
nach `<vault>/.obsidian/plugins/yijing-oracle/` legen und das Plugin unter
**Einstellungen → Community-Plugins** aktivieren.

### Aus dem Quelltext

```bash
git clone https://git.jkaindl.de/jkaindl/yijing-oracle
cd yijing-oracle
npm install
npm run build   # erzeugt main.js
```

Danach `main.js`, `manifest.json` und `styles.css` nach
`<vault>/.obsidian/plugins/yijing-oracle/` kopieren und Obsidian neu laden.

## Verwendung

Das Panel über das **Funken**-Ribbon-Icon oder den Befehl *Orakel-Panel öffnen* öffnen.
Eine Frage eintippen (optional) und **Münzen werfen** drücken — du bekommst die
Hexagramm-Figur, ihre Wandellinien und das Zielhexagramm.

Von dort aus:

- **Speichern** schreibt die Befragung als Notiz (oder fügt je nach Einstellung
  *Standard-Ausgabe* einen Link an der Cursorposition ein).
- **Mit KI deuten** streamt eine Deutung ins Panel, sofern ein LLM-Endpunkt
  konfiguriert ist. **Bild erzeugen** tut dasselbe für das Meditationsbild.
  Beim Speichern wird die Deutung mit entschärften Fernbildern und dataview-/dataviewjs-/js-engine-Blöcken (als einfacher Text) in die Notiz geschrieben, sodass beim Öffnen der Notiz nichts aus dem Netz geladen wird.
- **Neue Frage** leert das Feld für den nächsten Wurf.
- Frühere Befragungen stehen unter dem Panel — ein Klick darauf **rekonstruiert den
  Wurf** aus ihrem Frontmatter.

<p><a href="https://raw.githubusercontent.com/johannes-kaindl/yijing-oracle/main/docs/images/panel.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/yijing-oracle/main/docs/images/thumbs/panel.png" width="380" alt="Das Orakel-Panel: Frage-Feld, Wurf-Knopf, das Hexagramm als sechs Linien und die Weissagungs-Vorschau"></a><br><sub>Das Panel nach einem Wurf — zum Vergrößern klicken</sub></p>

<img src="https://raw.githubusercontent.com/johannes-kaindl/yijing-oracle/main/docs/images/reading-note.png" width="600" alt="Eine gespeicherte Befragung als Notiz: die Frage, das Ausgangs-Hexagramm mit Trigrammen, Urteil und Bild, die wandelnde Linie und das resultierende Hexagramm">
<br><sub>Jeder Wurf wird zu einer Notiz wie dieser — durchsuchbar, verlinkbar, deine.</sub>

Zwei Befehle übergehen das Panel und werfen sofort:

| Befehl | Was er tut |
|---|---|
| *Befragung in neue Notiz werfen* | Wirft und schreibt die Notiz, ohne Frage. |
| *Befragung an der Cursorposition werfen* | Wirft und fügt einen Link in die aktive Notiz ein. |

### Die beiden optionalen Funktionen

<table>
<tr>
<td><img src="https://raw.githubusercontent.com/johannes-kaindl/yijing-oracle/main/docs/images/interpretation.png" width="408" alt="Der Deutungs-Kasten im Panel mit einer fertigen Deutung und der zugeklappten Denkspur"><br><sub>KI-Deutung, gestreamt von einem lokalen Modell</sub></td>
<td><img src="https://raw.githubusercontent.com/johannes-kaindl/yijing-oracle/main/docs/images/artwork.png" width="408" alt="Der Bildmeditations-Kasten im Panel mit erzeugtem Bild und dem Szenen-Satz darunter"><br><sub>Bildmeditation, lokal erzeugt</sub></td>
</tr>
</table>

## Konfiguration

**Einstellungen → Yijing Oracle**, in fünf ausklappbaren Abschnitten:

| Abschnitt | Was drinsteht |
|---|---|
| **Allgemein** | Sprache der Befragung (oder Obsidian folgen), Register (klassisch / geschlechtsneutral), Standard-Ausgabe (neue Notiz / an der Cursorposition). |
| **Notiz & Ablage** | Ordner für Befragungen, Dateinamen-Schema (`{date}` `{time}` `{hex}` `{resulting}` `{hexpair}` `{question}`), nach dem Speichern öffnen. |
| **Notiz-Inhalt** | Frontmatter an/aus samt umbenennbarem Schlüssel je Feld, Wilhelms Fußnoten, Callout-Rahmen je Abschnitt. |
| **KI-Deutung** | Endpunkte (jede Zeile mit eigenem API-Schlüssel und Modell), System-Prompt (mitgelieferte Vorlagen oder eigener), Abschnitt **Anfrage** (Temperatur und Denkstufe je Modellfamilie), Verhalten der Reasoning-Anzeige. |
| **Bilderzeugung** | Bild-Endpunkt, Stil-Suffix, Negativ-Prompt, Größe. Siehe die [Einrichtungsanleitung](https://github.com/johannes-kaindl/yijing-oracle/blob/main/docs/image-generation.md). |

**Zu den Endpunkten:** eine Zeile nach der anderen hinzufügen — der **erste erreichbare gewinnt**, die Reihenfolge ist also die Priorität (**Diesen Endpunkt zuerst versuchen** schiebt eine Zeile nach oben). So deckt eine Konfiguration jedes Netz ab (localhost am Schreibtisch, LAN-IP unterwegs), ohne dass etwas umgestellt werden muss. Jede Zeile hat ihren eigenen Knopf **Verbindung prüfen** mit einem Ergebnis in Klartext sowie einen eigenen, optionalen API-Schlüssel und ein optionales Modell.

**Zu den API-Schlüsseln:** der Schlüssel jeder Zeile liegt im Schlüsselbund von Obsidian (vom Betriebssystem verschlüsselt, je Gerät), nicht im Vault — er wird also nie mit den Notizen synchronisiert oder gesichert, und du trägst ihn je Zeile einmal pro Gerät ein. Für lokale Server bleibt er leer. Ein Schlüssel aus der Zeit vor 0.11 (einer für alle Zeilen) wird beim ersten Start in jede Zeile kopiert; der alte Schlüsselbund-Eintrag bleibt unangetastet. Ist der LLM Endpoint Manager installiert, kommen Endpunkte und Schlüssel von dort.

<p><a href="https://raw.githubusercontent.com/johannes-kaindl/yijing-oracle/main/docs/images/settings.png"><img src="https://raw.githubusercontent.com/johannes-kaindl/yijing-oracle/main/docs/images/thumbs/settings.png" width="380" alt="Die Plugin-Einstellungen von oben nach unten: Allgemein, Notiz und Ablage, Notiz-Inhalt, KI-Deutung, Bildgenerierung"></a><br><sub>Die vollständige Einstellungsseite — zum Vergrößern klicken</sub></p>

## Funktionsweise

Drei Münzen je Linie (Verteilung 1:3:3:1), sechs Linien von unten nach oben aufgebaut,
auf die King-Wen-Reihenfolge abgebildet. Wandellinien ergeben ein zweites,
resultierendes Hexagramm. Das alles ist pure, getestete Logik (`src/core/`) mit einem
Paritäts-Gate, das beweist, dass die King-Wen-Tabelle zu den mitgelieferten Daten passt
— die vierte kanonische Kopie neben Web-App, Build-Skript und dem nativen OracleKit.

## Entwicklung

```bash
npm install
npm run dev      # esbuild watch → main.js
npm run gate     # lint + typecheck + test + check:pure + check:bundle
```

Der Orakel-Kern (`src/core/`) importiert nie `obsidian` (erzwungen von `check:pure`)
und ist vollständig unit-getestet. Die Schicht `src/obsidian/` trägt View, Einstellungen
und Datei-I/O.

## Dokumentation

- [Dokumentations-Index](https://github.com/johannes-kaindl/yijing-oracle/blob/main/docs/README.md) — alle Anleitungen an einem Ort (englisch).
- [Getting started](https://github.com/johannes-kaindl/yijing-oracle/blob/main/docs/getting-started.md) — von der Installation zur ersten gespeicherten Befragung (englisch).
- [Troubleshooting](https://github.com/johannes-kaindl/yijing-oracle/blob/main/docs/troubleshooting.md) — die genaue Meldung, ihre Ursache und die Abhilfe (englisch).

## Lizenz

Quellcode: **AGPL-3.0-or-later** (siehe [`LICENSE`](https://github.com/johannes-kaindl/yijing-oracle/blob/main/LICENSE)). Die Übersetzung von
Richard Wilhelm in den mitgelieferten Daten ist gemeinfrei. © 2026 Johannes Kaindl.
