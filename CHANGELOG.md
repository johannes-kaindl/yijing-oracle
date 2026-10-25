# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Changed
- Vendored `obsidian-kit` 0.70.0 (was 0.63.0) and `code-kit` 0.37.5 (was 0.31.0). What you may notice:
- Claude models now count as models that take images and always think (code-kit 0.33.0): in Settings, "Request", the thinking control for a Claude endpoint no longer offers "off" and reads "Thinking: low" or higher. A local model that only has "claude" in its name (such as a distill) does not count.
- The endpoint list knows the role "used for search, does not write" (code-kit 0.36.0). yijing-oracle never sets it, so no row changes.
- The list of models of an endpoint no longer reports to its listeners when nothing changed (obsidian-kit 0.70.0); the panel has no listener that could have looped, so nothing changes on screen.
- The streaming area builds its thinking block through a new routine in the kit (obsidian-kit 0.65.0); the block looks and behaves as before.
- The kit's new link protection and chat window, its Anthropic context limit and its text-level changes (frontmatter patch, redline, review list, version list, crop dialog) are not used by this plugin or do not touch it.

## [0.16.0] — 2026-10-18

### Changed
- Vendored `obsidian-kit` 0.63.0 (was 0.61.0) and `code-kit` 0.31.0 (was 0.28.0). You will notice four things:
- The thinking block of the interpretation has a copy button next to its title. It copies the thought as plain text and shows a check mark for a moment; clicking it does not open or close the block.
- A long line in the streaming interpretation wraps instead of running out of the panel on the right.
- A failed image generation now says why: busy (try again later), not available (switch the provider on), refused, took too long. Before, every failure read "Image generation failed".
- Settings, "Request" section: for a Claude endpoint the field reads "Thinking effort (effort)" instead of "(reasoning_effort)"; a button "Set family in manager" sits at the note "model family detected"; and a warning appears when the model you send is not loaded in LM Studio and sending would unload another one. With LM Studio, thinking and image support of a model are read from its own metadata instead of only guessed from its name.

### Fixed
- **A reading note whose marker block lost its end marker is no longer written to twice.** If you delete only the closing `<!-- yijing:deutung:end -->` (or `…bild:end -->`) line and then add an interpretation or an image, the plugin used to append a second block, and the next run replaced everything between the first marker and the new end, including text you had written there. It now leaves the note untouched and says which block is broken; add the end marker or remove the start marker and try again.

## [0.15.1] — 2026-10-16

### Changed

- Vendored `obsidian-kit` 0.61.0 (was 0.60.3) and `code-kit` 0.28.0 (was 0.27.2). You will notice two things:
- With Gemma 4 in LM Studio and "thinking off" the plugin now sends the lowest thinking level, because LM Studio ignores "none" for this model. The model still thinks a little (a few more tokens and a bit more time). The answer stays clean: the thinking sits in the collapsible thinking block, not in the reading. The settings say so ("cannot be fully turned off here").
- If the LLM Endpoint Manager is switched on only after Yijing Oracle, the settings pick it up in the same session (the subscription now follows a late manager by itself instead of staying silent).
- A backend or model family that this version does not know yet no longer makes a request fail; the "Request" section names it.

## [0.15.0] — 2026-10-14

### Fixed

- **Gemma 4 models no longer show their thinking as the interpretation.** `google/gemma-4-e4b` ignores "thinking off" and writes its thoughts into the answer text, closed by `<channel|>`; the interpretation started with "The user wants me to interpret …". The thoughts now go to the collapsible thinking block and the interpretation starts with the actual text. While the model is still thinking, the live view shows that text until the thoughts end, then it moves to the thinking block (`obsidian-kit` 0.60.3, `code-kit` 0.27.2).

### Changed

- **The meditation image now comes from the Local Image Generator plugin; the plugin's own image connection is gone.** Install and enable Local Image Generator and set up its image backend there; Yijing Oracle hands it the prompt and shows the file it writes into your vault. **Without Local Image Generator there are no images**: the image box does not appear in the panel. Removed settings (their old values are dropped from your settings file when the plugin loads): backend (A1111 / ComfyUI), image endpoint and its connection test, negative prompt, image size, steps, the ComfyUI workflow and the steps override. Server, size and negative prompt are set in Local Image Generator now (a ComfyUI workflow you pasted here belongs there). **Your style suffix stays.** See [Set up image generation](docs/image-generation.md).
- **Image generation no longer reproduces the same image for the same question.** The scene is still derived from the question, but the seed and the size are chosen by Local Image Generator. **Regenerate** asks again; the step-by-step progress count (ComfyUI only) is gone, the box shows "Generating image…" while it runs.
- **Where the image file lives:** Local Image Generator writes it into your attachment folder as soon as it is generated, before the reading note exists, and the note embeds that file when you save (no copy is made). An image you have not saved into a note is moved to the trash when you regenerate or cast again (through Obsidian's file manager, so your trash setting applies). An image a saved note embeds is never removed. If you delete the file before saving, the panel says the image file is no longer in the vault.

- **The finished interpretation shows the thoughts like the live view did.** After the stream ended, the thoughts used to reappear as a second, differently styled block, collapsed; now they keep the markup of the live view and stay open or closed as you left them.
- **Settings: the explanation under "Endpoints" matches the row editor.** It no longer says "one base URL per line"; it names the row with address, key and model.
- Vendored `obsidian-kit` 0.60.3 (was 0.59.1) and `code-kit` 0.27.2 (was 0.24.0). One thing is visible: a hint that lists dropped request parameters now lists them sorted (code-kit 0.26.0). The time stamp of a new reading (`date` in the note) is written by the shared local-time helper and looks exactly as before. Nothing else changes here: the tool-provider contract, share export, per-code manager error texts, the thinking-button style and the helper functions in between are not used by this plugin.

## [0.14.1] — 2026-10-12

### Fixed

- **The interpretation follows while it is written.** The live answer used to grow below the lower edge of the panel without the view scrolling along; now it follows to the end as long as you are at the bottom, also when a table, a code block or a whole paragraph arrives in one piece. Scrolling up still pauses it and does not pull you back.

### Changed

- **Endpoint list (LLM and image endpoint rows): the "move to front" and "remove endpoint" buttons stay together, and the address and the model ID stay fully visible at a normal window width.** When the row is too narrow, the block of model and buttons moves as a whole to a second row, right-aligned; nothing stands alone and nothing is cut off (obsidian-kit 0.59.1).
- **Settings, section "Request": "not detected yet" instead of "unknown".** For an endpoint whose model family is not known yet, the header reads "Family: not detected yet · Backend: not detected yet" with a hint that this is normal for a freshly added endpoint and that the LLM Endpoint Manager records family and backend; the fields read "Not sent yet — waiting for the model family" (obsidian-kit 0.59.0).
- Vendored `obsidian-kit` 0.59.1 (was 0.56.0) and `code-kit` 0.24.0 (was 0.23.0). The other releases in between change nothing you see in this plugin.

## [0.14.0] — 2026-10-12

### Changed

- **The endpoint row shows the model's context length again.** Under a reachable row with a model it reads "Context: loaded N · max M tokens", or "Context: max M tokens" / "Context: loaded N tokens" when the server names only one of the two; nothing is shown when it names neither. It comes from the shared endpoint list now, not from a line of this plugin. The lookup asks LM Studio first and Ollama second (new), and every attempt gives up after 5 s, so a server that accepts the connection and never answers no longer holds the settings.
- **The model dropdown of an endpoint row offers "— (server picks)" again.** Choosing it removes the model from that row, so the server decides (EN "— (server picks)", DE "— (Server wählt)"). In 0.13.0 a model you had set could not be cleared in the dropdown.
- **New notes get a different file name when the question or the filename scheme contains characters a file system rejects.** Until now they were deleted (`Re: A/B` → `Re AB`, `Was jetzt?` → `Was jetzt`); now each becomes `_` (`Re_ A_B`, `Was jetzt_`), in the question **and** in the filename scheme (`: / # ^ [ ] \ ? * " < > |`). Existing notes keep their names; a name that already exists still gets ` (2)`. The question is still cut to 48 characters.
- **The tooltips of the image endpoint's status icon use the wording of the shared endpoint list** (EN/DE), e.g. "Connection refused — server not running or wrong port." and, for an unknown failure, "Not reachable" without a dangling dash. They no longer come from this plugin's own table.
- **Vendored `obsidian-kit` 0.56.0 (was 0.53.0) and `code-kit` 0.23.0 (was 0.21.0).** What a user sees from the skipped releases: removing a reply's `<think>` block no longer takes seconds on degenerate answers (code-kit 0.22.0); long streamed replies render faster and leak fewer remote sources (obsidian-kit 0.54.0, the DOM guard works incrementally); an unfinished render block is no longer cut off when the panel closes (obsidian-kit 0.55.0). The new endpoint-row texts (context length, "server picks", status tooltips) are in obsidian-kit 0.56.0.

## [0.13.0] — 2026-10-11

### Changed

- **The global *Model* setting is gone; each endpoint row carries its own model.** An existing value moves once into every row that had none (a row with its own model keeps it; a row you clear stays empty after a restart). With an installed LLM Endpoint Manager the model is still chosen there.
- With the row the *Model* line takes its context-length display and its "Load models" button: the settings no longer show the loaded context length of the model. The model list is available in the endpoint row.
- When the panel has to pick a model itself (the row has none), it now stores the first model of the list in the active endpoint row instead of a global field.
- Vendored `obsidian-kit` 0.53.0 (was 0.51.3) and `code-kit` 0.21.0 (was 0.20.0). Mermaid diagrams in a reply that would load remote sources are now shown as plain `text`, and the redaction masks more bearer tokens.

## [0.12.1] — 2026-10-10

### Fixed

- A remote image behind a reference definition with a line break (`![x][a b]` plus `[a⏎b]: https://…`, or a target after a lone carriage return), and Mermaid diagrams that would load remote images (`A@{ img: … }`, `classDef … url(…)` and similar), are neutralized before the interpretation is saved. A reference-style image becomes its alt text in brackets, such a Mermaid fence becomes a plain `text` fence.

### Changed

- Vendored `code-kit` 0.20.0 (was 0.16.0). Besides the fixes above, `url(url(…))` and `image-set(image-set(…))` are removed as a whole even with a local target, and line endings are read as CommonMark reads them.

## [0.12.0] — 2026-10-10

### Changed

- **Saved interpretations no longer load remote images by themselves and show dataview/dataviewjs/js-engine blocks as plain text.** This replaces the 0.11.0 behaviour ("The saved note still receives the model's text as written"). Unchanged: links, inline `$=` expressions, HTML comments. The same goes for the reasoning in the note. Remote image syntax turns into plain text (`![x](https://…)` becomes `x (https://…)`), a `<img src="https://…">` tag is escaped. The interpretation in the panel is unchanged.
- A model answer that contains this plugin's own block marker (`<!-- yijing:…`) can no longer end the saved interpretation block early; the marker is written escaped. Adding an interpretation to an existing note ("Save interpretation" again) replaces the whole block as before.
- Vendored `code-kit` 0.16.0 (was 0.15.4).

### Fixed

- **Documentation: CORS is no longer described as required for the interpretation.** README, Getting started and Troubleshooting named a CORS message the plugin does not show. Measured against a server without CORS headers: the interpretation still arrives, in one piece instead of streaming, and no notice appears. Troubleshooting now has the real failure text and a section for the all-at-once case.

## [0.11.0] — 2026-10-09

### Changed

- **The AI connection now comes from the shared kit connection** (`obsidian-kit` 0.51.2, `createLlmConnection`): endpoint choice, model list, request parameters, chat client and the "Endpoints" and "Request" settings are one building block instead of a plugin-own copy. The visible effects follow.
- **API keys are per endpoint now.** Every row under **AI interpretation → Endpoints** has its own optional key, kept in Obsidian's keychain (OS-encrypted, per device), and an optional model. The single key for all rows is gone. On the first start your existing key is copied into every row; the old keychain entry is left untouched. Nothing is stored in `data.json` any more. Going back to 0.10 afterwards is not supported (it cannot read the new endpoint list).
- **The endpoint rows look and read differently**: **Test connection** button, **Try this endpoint first**, the key shows "saved" with **Change key** / **Remove key**, and the status and role texts have the kit's wording (for example "Timed out — network unreachable."). The **Request** section sits directly below the list, before the model row. The "Level picker in chat" switch is gone from it — it never had an effect in this plugin.
- **A model that loads on first use no longer times out after 2 minutes**: the wait for the first part of the answer is 10 minutes (it was 120 s). Once the answer is flowing, a pause of 2 minutes still ends the request.
- **A saved endpoint/model choice only applies with the LLM Endpoint Manager installed.** Without it the first reachable row and the model from the settings are used.
- **Secrets in your question or prompt are masked before sending.** API keys, bearer tokens and private-key blocks go to the model as placeholders and are put back in the answer you see, so the model never receives them. Nothing to configure.
- **The interpretation in the panel is shown without code formatting.** Fenced code and inline code lose their backticks, images and embeds appear as text, raw HTML is escaped; links still work. This keeps a model answer from running other plugins' code-block processors or loading remote images. The saved note still receives the model's text as written.
- The notice about a deviating answer (for example a model that thought despite "off") now uses the kit's text.

### Removed

- The plugin-own endpoint editor, API-key field, request-section texts and the separate connection test: the kit provides them.

## [0.10.1] — 2026-10-03

### Changed

- The changelog is now written entirely in English.
- Internal design notes moved out of the repository; the user documentation is unchanged.

## [0.10.0] — 2026-09-30

### Added

- **Request section under AI interpretation** (sampling profiles, `obsidian-kit` 0.45.1 `request-section`, `code-kit` 0.8.0 `capabilities`). It shows which model family and backend the interpretation runs on, which sampling values are sent (temperature, top_p, top_k, min_p, presence penalty, thinking effort) and whether they are known to work on that backend. You can override any value per model family, reset it, see the last request sent this session (copyable) and any deviation the server answered with. The fields are filled from the shared profile table for the mode "creative" instead of the server's own defaults.

### Changed

- **The interpretation now sends sampling values.** Until now it sent none except the thinking switch, so the model used the server's defaults. With a known model family (LM Studio, Open WebUI and similar) it now sends temperature 0.7 plus the family's recommended top_p/top_k and a thinking effort (default: medium). With an unknown family it sends only the temperature. gpt-oss still never gets the fields it rejects (HTTP 400, 0.6.1).
- The **Request thinking** toggle is replaced by the **Thinking level** dropdown in the new section (off / low / medium / high). Your old choice moves over once: on becomes "medium", off stays "off". The "Level picker in chat" switch in that section has no effect in this plugin (there is no chat button).
- The model is sent under the spelling the endpoint knows (alias resolved by the LLM Endpoint Manager), not always under the name shown in the list.

## [0.9.0] — 2026-09-27

### Added

- The GitHub release now also carries a ready-to-unpack `yijing-oracle.zip` (the plugin folder with `main.js`, `manifest.json` and `styles.css`) and a `checksums.sha256` file. For a manual install, download the zip and unpack it into `.obsidian/plugins/` instead of creating the folder and saving three files by hand.

### Changed

- Requires Obsidian 1.11.4 or newer (was 1.8.7). API keys are always stored in the system keychain via Obsidian's secret storage now — the plain-text `data.json` fallback for hosts without it is gone.
- Kit chat client 0.44.0 (no user-visible change)

## [0.8.0] — 2026-09-26

### Changed

- **Interpretation: Kit chat client instead of a local one** (`obsidian-kit` 0.43.0, `chat-client` + `chat-transport`). Visible effects: (1) A silent server now ends the request after 120 s without data instead of hanging forever; a long, healthy answer is not cut off. (2) An HTTP error shows the server's reason (for example "model not loaded") instead of "Chat HTTP 400". (3) If the server refuses the stream (origin/CORS check), the client retries once without streaming instead of reporting "blocked"; the separate "blocked by the endpoint" notice is gone because that case is now handled. (4) Failures other than a user abort always show the notice with the reason appended. No sampling values are sent, as before.
- Kit pin raised to `obsidian-kit` 0.43.0 / `code-kit` 0.7.0 for all vendored modules; the stream area's stylesheet copy follows (an empty status slot no longer takes space; the thinking block now follows the stream tail by itself).
- `think-splitter.ts` is vendored under its Kit name (was `think.ts`); the local `sse.ts` (XHR stream) and `chat-client.ts` are gone.

## [0.7.0] — 2026-09-26

### Added

- Help row at the top of the settings with links to the documentation and the issue tracker.

## [0.6.1] — 2026-09-24

### Fixed

- **`suppressThinking` no longer suppresses thinking on gpt-oss/harmony models** (`chat-client.ts`).
  These models reject `reasoning_effort`/`chat_template_kwargs`/`reasoning_budget` with HTTP 400
  instead of ignoring them as a no-op — the request used to fail whenever thinking suppression was
  active. Guard `isAlwaysOnThinker(effectiveModel)` (already vendored) before `suppressParams`,
  checked against the model name actually used (`opts.model ?? this.model`).

### Changed

- **`authorUrl` in the manifest points to the GitHub profile again** (`https://github.com/johannes-kaindl`), in line with the return to the Community Store.
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

- **Collapsible settings sections**: the settings are now divided into five areas
  (General · Note & storage · Note content · AI interpretation · Image meditation)
  instead of one long flat list. "General" is open, the rest collapsed; the open/closed
  state is remembered. Also operable by keyboard (Enter/Space).
- **Endpoint editor for the AI interpretation**: one row per endpoint instead of a text
  field — with a connection test **per row** (green tick / red cross with a plain-language
  explanation), one-click buttons for LM Studio and Ollama, a trash button per row and
  non-blocking hints for doubtful addresses (missing `http://`, placeholder IP, missing
  port).
- **Context length of the model** is shown at the model field, provided the server
  delivers it (LM Studio). Otherwise the display silently disappears.
- **Connection test for the image meditation**: the image endpoint could not be checked at
  all until now.

### Changed

- **The active AI endpoint is now determined instead of selected**: the "Active endpoint"
  dropdown is gone — the first reachable endpoint in the list wins, so the order is the
  priority. If you switch between networks (localhost on the computer, LAN IP on the go),
  you no longer have to change anything. Existing settings are adopted automatically on
  update.
- **"Wilhelm's footnotes"** now sits under "Note content" instead of under "Frontmatter".

### Fixed

- **Thinking switch for models that always think** (DeepSeek-R1 & co.): the switch showed
  "off" although the setting has no effect there. It is now greyed out and states the
  reason.
- **Endpoint messages appear in the configured language**: the connection test used to
  answer in German even with an English interface.

## [0.2.0] — 2026-07-15

## [0.1.1] — 2026-07-14

### Fixed

- **Divination preview scrolls again**: the full-height flex layout hung on a view height
  chain that does not bind in the sidebar DOM — the preview got no upper bound and could
  be scrolled neither on desktop nor on mobile. Switched back to a definite `max-height`
  (the box no longer stretches over the full panel height).

### Changed

- **"New question" clears the question field**: after a cast, no old question text remains
  in the input field.

## [0.1.0] — 2026-07-13

### Added

- **Three-coin oracle as an Obsidian plugin**: cast in the sidebar panel, every
  consultation becomes a searchable, linkable vault note (instead of localStorage).
  Bilingual DE/EN, register `neutral` as default; native, local-first.
- **Reading note with a common thread**: question → overview (both hexagrams + "decisive
  according to tradition") → AI interpretation → original image with changing lines →
  target image → remarks.
- **Zhu Xi rule hint**: shows, depending on the number of changing lines, which text is
  decisive (note, panel and LLM prompt); the decisive line is marked.
- **LLM interpretation** via local OpenAI-compatible models: panel streaming (reasoning +
  answer) and embedding as a section in the note; prompt presets
  (default/literary/C.G. Jung/concise), configurable system prompt, endpoint management.
- **Configurable note layout**: per section callout on/off + type; configurable
  frontmatter + file name scheme; Wilhelm's footnotes as an optional remarks section.
- **History in the panel**: click earlier consultations → the cast is reconstructed from
  the frontmatter.
- **Full-height panel layout**: the divination fills the free space (scrolls internally),
  capped interpretation/reasoning boxes, history collapsed by default at the bottom edge.
