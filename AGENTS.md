# AGENTS.md

Orientierung für KI-Agenten (Claude Code, Codex, …) und Mitwirkende an diesem Repository.

> **Workspace-Standards (maintainer-lokal):** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> im Multi-Projekt-Workspace des Maintainers, `../../_docs` relativ zu diesem Repo — nicht Teil dieses Repos,
> ignorieren falls im Klon nicht vorhanden. Modell comply-or-explain.

**Profil:** `ts-node` · `obsidian-plugin`.

## Project character

Obsidian-Plugin `yijing-oracle` (Autor: Johannes Kaindl): Drei-Münzen-I-Ging-Orakel im Vault —
Hexagramm-Texte nach Richard Wilhelm (DE + EN), jede Befragung wird eine durchsuchbare Vault-Note.
Local-first, optional KI-Deutung und Meditationsbild über lokale Server (OpenAI-kompatibel für die
Deutung; für das Bild wahlweise A1111-kompatibel oder ComfyUI mit eigenem Workflow-JSON). Native Re-Implementierung des Orakel-Kerns der Yijing-Web-App
(Schwester-Repo `yijing`) — kein Port. Nicht mit der Top-Level-Web-App verwechseln:
dies ist das Plugin.

## Commands

```bash
npm run dev            # esbuild Watch-Build
npm run build          # Typecheck + Produktions-Bundle
npm test               # vitest run
npm run lint           # eslint src
npm run gate           # lint + typecheck + typecheck:test + test + check:pure + check:bundle
npm run deploy         # Build + Kopie nach $OBSIDIAN_PLUGIN_DIR (muss gesetzt sein)
npm run release        # Release-Skript (nur auf Zuruf)
```

## Conventions

**Beim nächsten Kit-Sweep mitziehen: die Statusklasse `unauthorized`.**
Dieses Repo führt die Endpunkt-Statusklassen selbst über `t()` (`set.ep.status.*`), hat
aber noch die **alte** Fassung von `endpoint_diagnostics.ts` vendored — die Klasse gibt es
hier also noch nicht, und der fehlende Schlüssel fällt (noch) nicht auf. **In dem Moment,
in dem das Kit nachgezogen wird, erbt dieses Repo den Fehler**: `t()` fällt auf den
Schlüssel zurück, nicht auf EN, und in der Endpunkt-Zeile stünde `set.ep.status.unauthorized`
— aussehend wie ein String, nicht wie ein Fehler (gemessen im Sweep 2026-08-16; in
`markdown-presentation` und `vault-crews` ist genau das bereits eingetreten).

**Deshalb gehört zum Kit-Sweep hier beides:** den Schlüssel in EN **und** DE ergänzen und
einen Vollständigkeits-`Record<EndpointStatusKind, true>` im Test setzen, der am
`typecheck:test` bricht, sobald eine weitere Klasse dazukommt (CORE-TEST-04; Referenz:
`obsidian-transmute/tests/i18n-status-keys.test.ts`).

**Settings sind zweigleisig — `getSettingDefinitions()` ist die Wahrheit, nicht `display()`.**
Ab 0.5.0 rendert Obsidian ≥ 1.13 die Einstellungen selbst aus den Definitionen (nur so landen sie
in der Einstellungs-Suche); `display()` zeichnet dieselbe Struktur mit dem vendorierten Kit-Walker
für ältere Versionen nach. Wer eine Zeile ergänzt, ergänzt sie **einmal** in der Sektionsdatei —
und beachtet drei gemessene Fallstricke: bedingte Zeilen **weglassen** statt `visible: false`
(der native Renderer wertet es an Gruppen-Items nicht aus), Werte über `core/settings/controls.ts`
schreiben (der Host prüft nur den Control-Typ, nicht unsere Grenzen), und nach einer
Zustandsänderung `refreshSettingsTab` anstoßen (der Host rendert gecachte `settingItems`).
Prüfpunkte F1–F4 im GUI-Smoke messen genau das.

- Conventional Commits, deutsche Beschreibung erlaubt. Nur berührte Dateien stagen.
- `src/core/**` und `src/vendor/kit/**` importieren nie `obsidian` (`check:pure`-gated).
- Zweisprachigkeit DE/EN: Hexagramm-Texte + UI hängen an Reading- bzw. UI-Sprache.

## Memory

- **SDD-Artefakte (seit 2026-07-16): Cockpit, nicht Repo** — Specs/Plans/Task-Reports leben im
  Coding-Cockpit des Maintainers (`$VAULT/25_Coding/yijing-oracle/_SDD/`, CORE-META-14, maintainer-lokal).
  Sie tragen Arbeitskontext (Vault-Pfade, Schwester-Repo-Interna), der in einem public Repo niemandem nützt.
  Das Repo behält die Design-Essenz in dieser Datei + `CHANGELOG.md`.
- **Alt-Bestand:** `docs/superpowers/{specs,plans}/` ist eingefroren — nichts Neues dort ablegen.
- **Nie im Repo:** absolute Pfade außerhalb des Repos (`/Users/…`, Vault-Pfade) — Platzhalter nutzen
  (`$VAULT/…`, `~/…`, repo-relativ). Herkunftsnachweise als Repo-Name + `Datei:Zeile` sind dagegen erwünscht.
  Gate: `scripts/check-no-abs-paths.mjs` (Teil von `npm test`).

## Dach-Kontext (obsidian-plugins)

Dieses Repo liegt unter einem Koordinations-Dach. Vor dem Lösen eines Problems: `../AGENTS.md`
(Kit-first-Regel), `../REGISTRY.md` (Lösungs-Registry) und `../KIT-MATRIX.md` prüfen; vor
UI-Arbeit ist `../UI-STANDARD.md` verbindlich.
