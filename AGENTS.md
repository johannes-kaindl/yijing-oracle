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

**Erledigt am 2026-09-02: die Statusklasse `unauthorized`.** Hier stand ein Sperrvermerk —
dieses Repo führte die Endpunkt-Statusklassen über `t()`, hatte aber die alte Fassung von
`endpoint_diagnostics.ts` vendored, und ein beiläufiger Kit-Nachzug hätte `t()` auf den
Schlüsselnamen zurückfallen lassen: in der Endpunkt-Zeile stünde `set.ep.status.unauthorized`,
aussehend wie ein String, nicht wie ein Fehler (in `markdown-presentation` und `vault-crews`
bereits eingetreten). Beides ist jetzt da: der Schlüssel in EN und DE, die Datei auf Kit 0.29.0.

**Was an seine Stelle tritt, ist kein Vermerk, sondern ein Wächter.**
`tests/i18n-status-keys.test.ts` hält einen `Record<EndpointStatusKind, true>`; bringt ein
Kit-Nachzug eine weitere Statusklasse mit, bricht er am `typecheck:test`, bevor der rohe
Schlüssel eine Oberfläche erreicht (CORE-TEST-04, Form aus `obsidian-transmute`). Gegenprobe
gefahren: eine erfundene Klasse in der Union lässt genau diesen Record brechen.
**Die Lehre gilt über diesen Fall hinaus:** ein Sperrvermerk in einer Datei ist eine Notiz, die
nur wirkt, wenn jemand sie liest — und Vendoring ist der Vorgang, bei dem niemand liest. Wo ein
Vermerk „nicht beiläufig nachziehen" sagt, gehört stattdessen etwas hin, das beim Nachziehen
bricht.

**Settings sind zweigleisig — `getSettingDefinitions()` ist die Wahrheit, nicht `display()`.**
Ab 0.5.0 rendert Obsidian ≥ 1.13 die Einstellungen selbst aus den Definitionen (nur so landen sie
in der Einstellungs-Suche); `display()` zeichnet dieselbe Struktur mit dem vendorierten Kit-Walker
für ältere Versionen nach. Wer eine Zeile ergänzt, ergänzt sie **einmal** in der Sektionsdatei —
und beachtet vier gemessene Fallstricke: bedingte Zeilen **weglassen** statt `visible: false`
(der native Renderer wertet es an Gruppen-Items nicht aus), Werte über `core/settings/controls.ts`
schreiben (der Host prüft nur den Control-Typ, nicht unsere Grenzen), nach einer
Zustandsänderung `refreshSettingsTab` anstoßen (der Host rendert gecachte `settingItems`), und
**alles, was das `inputEl` braucht, ist eine `render`-Hatch** — die deklarative API kennt kein
Passwortfeld: `SettingTextControl` trägt genau `type: 'text'` und `placeholder` (gemessen an
`obsidian.d.ts` 1.13.1, dazu `SecretComponent`/`SecretStorage` als eigene, ungenutzte Schiene).
Ob das die Auffindbarkeit kostet, ist noch **abgeleitet, nicht gemessen**: `searchable`/`aliases`
sitzen auf `SettingDefinitionBase`, von der auch `SettingDefinitionRender` erbt — daraus *sollte*
folgen, dass eine Hatch-Zeile in der Einstellungs-Suche bleibt. Der DEFER von 2026-07-16 stand
schon einmal auf so einer Ableitung und war falsch; belastbar wird der Satz erst durch
Prüfpunkt F6, der die maskierte Zeile in der Suche sucht. Betroffen ist heute das
API-Schlüssel-Feld (maskiert seit 2026-09-02).
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
