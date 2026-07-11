# Yijing Oracle

Cast the *I Ching* (Yijing) inside Obsidian. A three-coin oracle with the classic
Richard Wilhelm hexagram texts — and every reading is saved as a **vault note**:
searchable, linkable, part of your thinking. Local-first, no cloud, no account.

> Native Obsidian re-implementation of the oracle core from the
> [Yijing web/app project](https://codeberg.org/jkaindl/Yijing). Not a port of the
> whole thing — a focused plugin where the vault is the oracle journal.

## Features (v1)

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

## Licence

Source code: **AGPL-3.0-or-later** (see [`LICENSE`](LICENSE)). The Richard Wilhelm
translation in the bundled data is public domain. © 2026 Johannes Kaindl.
