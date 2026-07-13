# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
