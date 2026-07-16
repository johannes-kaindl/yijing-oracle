# Yijing Oracle

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://codeberg.org/jkaindl/yijing-oracle/src/branch/main/LICENSE)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/yijing-oracle?gitea_url=https%3A%2F%2Fcodeberg.org&label=release)](https://codeberg.org/jkaindl/yijing-oracle/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.8.7%2B%20·%20desktop%20%26%20mobile-7c3aed)

Cast the *I Ching* (Yijing) inside Obsidian. A three-coin oracle with the classic
Richard Wilhelm hexagram texts — and every reading is saved as a **vault note**:
searchable, linkable, part of your thinking. Local-first, no cloud, no account.

> Native Obsidian re-implementation of the oracle core from the
> [Yijing web/app project](https://codeberg.org/jkaindl/Yijing). Not a port of the
> whole thing — a focused plugin where the vault is the oracle journal.

## Features

- **Sidebar panel** — ask a question (or don't), cast the coins, see the hexagram
  figure, changing lines and the resulting hexagram, then save.
- **Readings as notes** — each cast becomes a Markdown note with frontmatter
  (`hexagram`, `changing_lines`, `resulting`, `question`, …) in a folder of your
  choice, or inserted at the cursor of the current note.
- **Bilingual DE + EN** — hexagram texts and UI in German or English; follows your
  Obsidian language or a fixed setting.
- **Register** — classic (Wilhelm) or gender-neutral phrasing.
- **Two direct commands** — *Cast into a new note* and *Cast at the cursor* — plus
  the panel.
- **AI interpretation (optional, local)** — stream a reading interpretation from a
  local OpenAI-compatible LLM server (LM Studio, Ollama, …); system prompt,
  endpoints and reasoning display are configurable. Off until you set an endpoint.
- **Meditation image (optional, local)** — generate one image per reading from the
  hexagram's curated motif via a local A1111-compatible image server (Draw Things,
  A1111, Forge, …). Panel preview + note embed. Off until you set an endpoint —
  see [docs/image-generation.md](docs/image-generation.md) for setup.

## Requirements

- **Obsidian 1.8.7+** (desktop or mobile).
- Nothing else for the oracle itself — the hexagram data is bundled, and casting
  works fully offline.
- **Optional, for AI interpretation:** an OpenAI-compatible local server (e.g.
  [LM Studio](https://lmstudio.ai) or [Ollama](https://ollama.com)). Endpoint and
  model are set in the plugin settings.
- **Optional, for meditation images:** an A1111-compatible image server (e.g.
  [Draw Things](https://drawthings.ai) with its API server enabled). See the
  [setup guide](docs/image-generation.md).

Both optional features stay off until you configure an endpoint. Nothing ever leaves
your machine.

## Install

### Community plugins (recommended)

Search for **Yijing Oracle** in **Settings → Community plugins → Browse**, then click
**Install** and **Enable**.

### Manual

Download `main.js`, `manifest.json` and `styles.css` from the
[latest release](https://codeberg.org/jkaindl/yijing-oracle/releases) and place them in
`<vault>/.obsidian/plugins/yijing-oracle/`, then enable the plugin under
**Settings → Community plugins**.

### From source

```bash
git clone https://codeberg.org/jkaindl/yijing-oracle
cd yijing-oracle
npm install
npm run build   # produces main.js
```

Then copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/yijing-oracle/` and reload Obsidian.

## Usage

Open the panel via the **sparkles** ribbon icon or the *Open oracle panel* command.
Type a question (optional) and hit **Cast the coins** — you get the hexagram figure,
its changing lines and the resulting hexagram.

From there:

- **Save** writes the reading as a note (or inserts a link at your cursor, depending
  on the *Default output* setting).
- **Interpret with AI** streams an interpretation into the panel, if an LLM endpoint
  is configured. **Generate image** does the same for the meditation image.
- **New question** clears the field for the next cast.
- Past readings are listed below the panel — clicking one **reconstructs the cast**
  from its frontmatter.

Two commands skip the panel entirely and cast straight away:

| Command | What it does |
|---|---|
| *Cast a reading into a new note* | Casts and writes the note, no question. |
| *Cast a reading at the cursor* | Casts and inserts a link in the active note. |

## Configuration

**Settings → Yijing Oracle**, grouped into five collapsible sections:

| Section | What's in it |
|---|---|
| **General** | Reading language (or follow Obsidian), register (classic / gender-neutral), default output (new note / at cursor). |
| **Note & storage** | Readings folder, filename scheme (`{date}` `{time}` `{hex}` `{resulting}` `{hexpair}` `{question}`), open-after-save. |
| **Note content** | Frontmatter on/off plus a renameable key per field, Wilhelm's footnotes, per-section callout wrapping. |
| **AI interpretation** | Endpoints, model, API key, system prompt (built-in templates or your own), thinking behaviour. |
| **Image generation** | Image endpoint, style suffix, negative prompt, size. See the [setup guide](docs/image-generation.md). |

**On endpoints:** list them one per line — the **first reachable one wins**, so the
order is the priority. That way one config covers every network (localhost at your
desk, LAN IP on the go) without switching anything. Each row has its own connection
test with a plain-language result.

## How it works

Three coins per line (distribution 1:3:3:1), six lines built bottom-up, mapped to the
King-Wen sequence. Changing lines yield a second, resulting hexagram. All of this is
pure, tested logic (`src/core/`) with a parity gate proving the King-Wen table matches
the bundled data — the fourth canonical copy alongside the web app, build script and
the native OracleKit.

## Development

```bash
npm install
npm run dev      # esbuild watch → main.js
npm run gate     # lint + typecheck + test + check:pure + check:bundle
```

The oracle core (`src/core/`) never imports `obsidian` (enforced by `check:pure`) and
is fully unit-tested. The `src/obsidian/` layer holds the view, settings and file I/O.

## License

Source code: **AGPL-3.0-or-later** (see [`LICENSE`](LICENSE)). The Richard Wilhelm
translation in the bundled data is public domain. © 2026 Johannes Kaindl.
