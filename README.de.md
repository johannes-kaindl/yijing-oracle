# Yijing Oracle

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://git.jkaindl.de/jkaindl/yijing-oracle/src/branch/main/LICENSE)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/yijing-oracle?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/yijing-oracle/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.8.7%2B%20·%20Desktop%20%26%20Mobil-7c3aed)

> **Hinweis:** Diese Übersetzung folgt der englischen [`README.md`](README.md).
> Bei Abweichungen gilt die englische Fassung.

Das *I Ging* (Yijing) in Obsidian befragen. Ein Drei-Münzen-Orakel mit den klassischen
Hexagramm-Texten von Richard Wilhelm — und jede Befragung wird als **Notiz im Vault**
gespeichert: durchsuchbar, verlinkbar, Teil deines Denkens. Local-first, keine Cloud,
kein Konto.

> Native Obsidian-Neuimplementierung des Orakel-Kerns aus dem
> [Yijing-Web-/App-Projekt](https://git.jkaindl.de/jkaindl/Yijing). Keine Portierung des
> Ganzen — ein fokussiertes Plugin, in dem der Vault das Orakel-Journal ist.

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
  [docs/image-generation.md](docs/image-generation.md).

## Voraussetzungen

- **Obsidian 1.8.7+** (Desktop oder Mobil).
- Sonst nichts für das Orakel selbst — die Hexagramm-Daten sind mitgeliefert, das
  Werfen funktioniert vollständig offline.
- **Optional, für die KI-Deutung:** ein OpenAI-kompatibler lokaler Server (z.B.
  [LM Studio](https://lmstudio.ai) oder [Ollama](https://ollama.com)). Endpunkt und
  Modell werden in den Plugin-Einstellungen gesetzt.
- **Optional, für Meditationsbilder:** ein A1111-kompatibler Bild-Server (z.B.
  [Draw Things](https://drawthings.ai) mit aktiviertem API-Server). Siehe die
  [Einrichtungsanleitung](docs/image-generation.md).

Beide optionalen Funktionen bleiben aus, bis ein Endpunkt konfiguriert ist. Nichts
verlässt jemals deinen Rechner.

## Installation

### Community-Plugins (empfohlen)

In **Einstellungen → Community-Plugins → Durchsuchen** nach **Yijing Oracle** suchen,
dann **Installieren** und **Aktivieren**.

### Manuell

`main.js`, `manifest.json` und `styles.css` aus dem
[neuesten Release](https://git.jkaindl.de/jkaindl/yijing-oracle/releases) herunterladen,
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
- **Neue Frage** leert das Feld für den nächsten Wurf.
- Frühere Befragungen stehen unter dem Panel — ein Klick darauf **rekonstruiert den
  Wurf** aus ihrem Frontmatter.

Zwei Befehle übergehen das Panel und werfen sofort:

| Befehl | Was er tut |
|---|---|
| *Befragung in neue Notiz werfen* | Wirft und schreibt die Notiz, ohne Frage. |
| *Befragung an der Cursorposition werfen* | Wirft und fügt einen Link in die aktive Notiz ein. |

## Konfiguration

**Einstellungen → Yijing Oracle**, in fünf ausklappbaren Abschnitten:

| Abschnitt | Was drinsteht |
|---|---|
| **Allgemein** | Sprache der Befragung (oder Obsidian folgen), Register (klassisch / geschlechtsneutral), Standard-Ausgabe (neue Notiz / an der Cursorposition). |
| **Notiz & Ablage** | Ordner für Befragungen, Dateinamen-Schema (`{date}` `{time}` `{hex}` `{resulting}` `{hexpair}` `{question}`), nach dem Speichern öffnen. |
| **Notiz-Inhalt** | Frontmatter an/aus samt umbenennbarem Schlüssel je Feld, Wilhelms Fußnoten, Callout-Rahmen je Abschnitt. |
| **KI-Deutung** | Endpunkte, Modell, API-Schlüssel, System-Prompt (mitgelieferte Vorlagen oder eigener), Verhalten der Reasoning-Anzeige. |
| **Bilderzeugung** | Bild-Endpunkt, Stil-Suffix, Negativ-Prompt, Größe. Siehe die [Einrichtungsanleitung](docs/image-generation.md). |

**Zu den Endpunkten:** einer pro Zeile — der **erste erreichbare gewinnt**, die
Reihenfolge ist also die Priorität. So deckt eine Konfiguration jedes Netz ab
(localhost am Schreibtisch, LAN-IP unterwegs), ohne dass etwas umgestellt werden muss.
Jede Zeile hat ihren eigenen Verbindungstest mit einem Ergebnis in Klartext.

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

## Lizenz

Quellcode: **AGPL-3.0-or-later** (siehe [`LICENSE`](LICENSE)). Die Übersetzung von
Richard Wilhelm in den mitgelieferten Daten ist gemeinfrei. © 2026 Johannes Kaindl.
