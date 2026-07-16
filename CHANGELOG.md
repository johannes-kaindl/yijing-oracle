# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

## [0.3.0] — 2026-07-16

### Added

- **Einklappbare Einstellungs-Sektionen**: die Einstellungen sind jetzt in fünf Bereiche
  gegliedert (Allgemein · Notiz & Ablage · Notiz-Inhalt · KI-Deutung · Bildmeditation)
  statt einer langen flachen Liste. „Allgemein" ist offen, der Rest eingeklappt; der
  Auf-/Zu-Zustand wird gemerkt. Bedienbar auch per Tastatur (Enter/Leertaste).
- **Endpunkt-Editor für die KI-Deutung**: eine Zeile je Endpunkt statt eines Textfelds —
  mit Verbindungstest **pro Zeile** (grüner Haken / rotes X samt Klartext-Erklärung),
  Ein-Klick-Buttons für LM Studio und Ollama, Papierkorb pro Zeile und nicht-blockierenden
  Hinweisen bei zweifelhaften Adressen (fehlendes `http://`, Platzhalter-IP, fehlender Port).
- **Kontextlänge des Modells** wird am Modell-Feld angezeigt, sofern der Server sie liefert
  (LM Studio). Andernfalls entfällt die Anzeige stillschweigend.
- **Verbindungstest für die Bildmeditation**: der Bild-Endpunkt ließ sich bisher gar nicht
  prüfen.

### Changed

- **Der aktive KI-Endpunkt wird jetzt ermittelt statt ausgewählt**: das Dropdown „Aktiver
  Endpunkt" entfällt — der erste erreichbare Endpunkt aus der Liste gewinnt, die
  Reihenfolge ist damit die Priorität. Wer zwischen Netzen wechselt (localhost am Rechner,
  LAN-IP unterwegs), muss nichts mehr umstellen. Bestehende Einstellungen werden beim
  Update automatisch übernommen.
- **„Wilhelms Fußnoten"** steht jetzt unter „Notiz-Inhalt" statt unter „Frontmatter".

### Fixed

- **Thinking-Schalter bei Modellen, die immer denken** (DeepSeek-R1 & Co.): der Schalter
  zeigte „aus", obwohl die Einstellung dort wirkungslos ist. Er ist jetzt ausgegraut und
  benennt den Grund.
- **Endpunkt-Meldungen erscheinen in der eingestellten Sprache**: der Verbindungstest
  antwortete bisher auch bei englischer Oberfläche auf Deutsch.

## [0.2.0] — 2026-07-15

## [0.1.1] — 2026-07-14

### Fixed

- **Weissagungs-Vorschau scrollt wieder**: das Voll-Höhen-Flex-Layout hing an einer
  View-Höhenkette, die im Sidebar-DOM nicht bindet — die Vorschau bekam keine obere
  Schranke und ließ sich weder auf Desktop noch mobil scrollen. Wieder auf eine definite
  `max-height` umgestellt (der Kasten dehnt sich nicht mehr über die volle Panel-Höhe).

### Changed

- **„Neue Frage" leert das Frage-Feld**: nach einem Wurf bleibt kein alter Fragetext mehr
  im Eingabefeld stehen.

## [0.1.0] — 2026-07-13

### Added

- **Drei-Münzen-Orakel als Obsidian-Plugin**: Wurf im Sidebar-Panel, jede Befragung wird
  eine durchsuchbare, verlinkbare Vault-Note (statt localStorage). Zweisprachig DE/EN,
  Register `neutral` als Default; nativ, lokal-first.
- **Reading-Note mit rotem Faden**: Frage → Überblick (beide Hexagramme + „maßgeblich nach
  Tradition") → KI-Deutung → Ursprungsbild mit wandelnden Linien → Zielbild → Anmerkungen.
- **Zhu-Xi-Regel-Hinweis**: zeigt je nach Anzahl wandelnder Linien, welcher Text maßgeblich
  ist (Note, Panel und LLM-Prompt); die maßgebliche Linie wird markiert.
- **LLM-Deutung** über lokale OpenAI-kompatible Modelle: Panel-Streaming (Reasoning +
  Antwort) und Einbettung als Abschnitt in die Note; Prompt-Presets
  (default/literarisch/C.G.Jung/knapp), konfigurierbarer System-Prompt, Endpoint-Verwaltung.
- **Konfigurierbares Notiz-Layout**: pro Abschnitt Callout an/aus + Typ; konfigurierbares
  Frontmatter + Dateiname-Schema; Wilhelms Fußnoten als optionaler Anmerkungen-Abschnitt.
- **History im Panel**: frühere Befragungen anklicken → Wurf wird aus dem Frontmatter
  rekonstruiert.
- **Voll-Höhen-Panel-Layout**: Weissagung füllt den freien Platz (scrollt intern),
  gedeckelte Deutungs-/Reasoning-Kästen, History standardmäßig eingeklappt am unteren Rand.
