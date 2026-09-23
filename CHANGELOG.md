# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Fixed

- **`suppressThinking` no longer suppresses thinking on gpt-oss/harmony models** (`chat-client.ts`).
  These models reject `reasoning_effort`/`chat_template_kwargs`/`reasoning_budget` with HTTP 400
  instead of ignoring them as a no-op — the request used to fail whenever thinking suppression was
  active. Guard `isAlwaysOnThinker(effectiveModel)` (already vendored) before `suppressParams`,
  checked against the model name actually used (`opts.model ?? this.model`).

### Changed

- **Three explanatory texts reworded to the richer, cross-plugin-consolidated wording from
  `obsidian-kit`'s `explain-texts` module:** the CORS notice shown when a local server refuses
  the streaming request (now also mentions the LM Studio GUI toggle and Ollama's
  `OLLAMA_ORIGINS`, not just the CLI flag), and the two "no model list" / "endpoint
  unreachable" hints shown next to the model field when the LLM Endpoint Manager plugin is
  active — the "unreachable" hint now correctly says the saved model value is kept (the field
  is locked to it), instead of the previous, inaccurate "type the model name" (that only
  applies to the "no model list" case). Wording only; no behavior change beyond the corrected
  "unreachable" text.

## [0.6.0] — 2026-09-16

### Added

- **Optional integration with the `LLM Endpoint Manager` plugin.** If it is installed, the AI
  interpretation now uses the endpoints and API keys configured there — pick an endpoint (or
  leave it on "automatic") and a model in the settings; your local endpoint list stays as a
  fallback (and can be copied into the manager with one click) but no longer takes priority
  once the manager is present. Without the manager plugin, nothing changes: the local endpoint
  list and API key field work exactly as before.

### Changed

- **API key storage moved to `obsidian-kit`'s `secrets` module** (vendored, floor-adapted for
  this plugin's `minAppVersion` 1.8.7). Behavior is unchanged; internal only.
- **Streaming answer area now uses the shared `obsidian-kit` component (`buildStreamArea`)**
  instead of the hand-rolled one. Two visible behavior changes: the thinking block stays open
  for the whole duration of a stream (it used to be forced open too, but is now driven by the
  same shared logic other plugins use), and auto-scroll now only follows the stream while you
  are at the bottom — scroll up during a long answer and it stays put instead of yanking you
  back down.

## [0.5.2] — 2026-09-03

### Security

- **The API key no longer lives in `data.json`.** Until now it was stored there in plain text —
  a file inside the vault that every sync (Obsidian Sync, iCloud, Dropbox, git) and every backup
  carries along. On Obsidian 1.11.4 or newer the key now goes into Obsidian's keychain
  (`SecretStorage`, OS-encrypted, per device); an existing key is moved there on the first load
  and wiped from `data.json`. The keychain is not synced, so on each additional device the key
  is entered once. On older Obsidian versions (down to the plugin's floor, 1.8.7) nothing
  changes. Should the keychain refuse to store the value, the key stays in `data.json` as before
  and a warning is written to the console — never a silent loss.

### Fixed

- **The API key is now actually sent.** The setting existed since 0.2.0, was stored, and was
  never put on the wire — no request carried an `Authorization` header. Anyone pointing the
  plugin at an external OpenAI-compatible provider got a 401 with no usable hint, because the
  field looked filled in. The key now travels on every LLM request: the chat stream, the model
  list, the LM Studio context lookup **and the reachability probe**. The probe is the one that
  mattered most: without the header an authenticated endpoint answers 401, never counts as
  reachable, and is silently skipped — the feature looked dead rather than misconfigured.
- **The API key field is masked.** It was a plain text field, so the key was readable in
  screenshots and during screen sharing.
- **An endpoint that rejects the key now says so.** A 401 or 403 was reported as "Responds, but
  is not an OpenAI-compatible endpoint" — the least helpful thing to say about a server that is
  answering correctly and only refusing the credentials. It now reads "Access denied — the API
  key is missing or invalid."
- **A filename template containing a JavaScript prototype name no longer produces a garbled
  file name.** Twelve placeholders — `{toString}`, `{constructor}`, `{valueOf}`,
  `{hasOwnProperty}`, `{isPrototypeOf}`, `{toLocaleString}`, `{propertyIsEnumerable}`,
  `{__proto__}`, `{__defineGetter__}`, `{__defineSetter__}`, `{__lookupGetter__}`,
  `{__lookupSetter__}` — resolved to inherited object members instead of staying literal:
  `{toString}` produced a note named `function toString() { native code }`,
  `{__proto__}` produced `object Object`. They now stay literal like any other typo in the
  template, which is what every other unknown placeholder already did. The filename template
  is a free text field in the settings, so the way in was typing, not code.
- **A line break in a callout title or type no longer breaks the callout.** Everything after
  the break used to land as bare text next to the callout; line breaks in the head are now
  collapsed to a single space. The callout type is a free text field per section, and
  trimming only removed whitespace at the edges — a break pasted into the middle survived.
  Output is byte-identical for every input that produced a valid callout before.

## [0.5.1] — 2026-08-16

### Fixed

- The explanatory line above the callout settings was missing on Obsidian 1.13 and later
  (introduced in 0.5.0). A settings row with text but no control is skipped by Obsidian's
  declarative renderer; it now draws through the same path as the classic one.

## [0.5.0] — 2026-08-16

### Changed

- **Settings now use Obsidian's declarative settings API.** On Obsidian 1.13 and later the
  settings are rendered by Obsidian itself from `getSettingDefinitions()`, which means they
  finally appear in the **settings search** — measured against a running 1.13.7: searching for
  a setting of this plugin returned nothing before this change and finds it now. Nothing moves
  or disappears: the same seven sections in the same order, and on Obsidian below 1.13 an
  identical fallback draws them with the classic API, so `minAppVersion` stays at 1.8.7.
- The reading folder is now a **folder field with autocompletion** instead of plain text.

### Fixed

- Settings values are validated in one place now instead of in each input handler. A step
  count of `abc`, an empty template or a stray object no longer reach `data.json`; they fall
  back to the documented default. Leaving the ComfyUI step override empty still means "the
  workflow wins" — that is a value, not a missing one.

## [0.4.0] — 2026-08-16

### Added

- **ComfyUI as a second image backend.** The image section now has a backend choice. For
  ComfyUI you paste a workflow exported from the app (Workflow → Export (API)); the plugin
  inserts prompt, negative prompt, seed, steps and size into it and leaves everything else
  alone — sampler, scheduler, CFG, LoRAs and upscalers stay yours. It finds the insertion
  points by following the graph's own node links, so structurally different workflows
  (SDXL, Flux, Z-Image Turbo) work with the same code. The settings show which nodes were
  detected, so an unusable workflow fails while you set it up rather than after minutes of
  waiting. Progress is reported live over a WebSocket — where ComfyUI allows the connection
  (see below).
- **Steps setting for A1111** — previously hardcoded to 28. For ComfyUI it is an optional
  override; left empty, the value from your workflow wins.

### Fixed

- **A blocked AI interpretation now says why.** Local model servers reject requests coming
  from Obsidian's renderer unless CORS is enabled — the interpretation streams over
  `XMLHttpRequest`, which always sends `Origin: app://obsidian.md`. The old message
  ("check the endpoint in the settings") pointed the wrong way, because the endpoint is
  fine: the settings connection test goes through `requestUrl` in the main process and
  sends no `Origin` at all. The panel now names CORS and the fix (LM Studio:
  `lms server start --cors`); the README lists it as a requirement.
- **The image panel no longer stays silent when progress is unavailable.** ComfyUI requires
  the `Origin` header to match its own host, and Obsidian's renderer always sends
  `app://obsidian.md` — so the progress WebSocket is rejected with 403 on a default setup,
  and the step counter never appeared. The image itself was never affected: those requests
  go through Obsidian's `requestUrl` in the main process, which sends no `Origin` at all.
  The panel now says so instead of showing an unchanging "Generating image…" that is
  indistinguishable from a stuck run. To get the counter, start ComfyUI with
  `--enable-cors-header "app://obsidian.md"`.
- **`check:pure` never checked anything.** The gate searched for `from 'obsidian'` with
  single quotes while the entire codebase uses double quotes, so it could not produce a
  match; it also passed when a scanned directory was missing. Replaced with the script
  version used across the sibling plugins.

### Changed
- **Settings sections no longer collapse.** They are all open now, separated by headings.
  This is a trade: collapsible sections and Obsidian's settings **search** (1.13+) are
  mutually exclusive, and search solves the underlying problem of a long page better — you
  no longer need to know which section holds a setting, you type its name. Your stored
  open/closed state is kept in the configuration and simply ignored.

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
