// vendored from code-kit@0.15.0, src/ts/pure/safe-markdown.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// uebernommen aus settings-assistant/src/core/chat-markdown.ts, 2026-10-09
/** Neutralises Markdown from an untrusted source (a model answer) BEFORE it is handed to a
 *  Markdown renderer. Pure, no dependencies.
 *
 *  Why: Obsidian's `MarkdownRenderer.render` runs everything registered in the vault, not only
 *  the core. A model answer that contains a fenced block with a language tag
 *  (```` ```dataviewjs ````, `~~~dataview`, …) starts that plugin's code-block processor — for
 *  Dataview JS that is arbitrary code in the renderer. Inline code such as `` `$= dv.pages()` ``
 *  is executed the same way, and remote images and embeds (`![…](url)`, `![[…]]`) load on their
 *  own and can carry context out. Raw HTML (`<img>`, `<iframe>`, `<script>`) is the third door.
 *
 *  Where it applies: obsidian-kit's stable-writer calls it by default on the text it renders;
 *  a consumer that renders model output through another path calls it before the renderer.
 *  The function is idempotent, so applying it in addition to that default is safe.
 *
 *  Strategy: REMOVE instead of RECOGNISE. Any version that detects fences or code spans and
 *  rewrites them selectively eventually reads line endings (`\r`, `\r\n`), indents, backtick
 *  lengths and multi-line spans differently from the renderer. So the ability to produce code
 *  elements is removed:
 *  1. EVERY backtick (U+0060) becomes U+02CB "ˋ" — no backtick fences, no inline code spans.
 *  2. EVERY run of three or more tildes becomes as many U+02DC "˜" — no tilde fences, whatever
 *     the indent, quote or list prefix and whatever the line ending. (`~~` strikethrough stays.)
 *  3. Images become text, `![[…]]` becomes literal `[[…]]` (escaped, no link), every `<` becomes
 *     `&lt;`.
 *  4. Blocks indented by four spaces stay: they carry no language tag and start no processor.
 *  Links stay (a click is a user action). Code formatting in chat answers is lost by this —
 *  accepted; a consumer that needs code rendering extracts and renders those blocks itself,
 *  before this function, from the raw text.
 *
 *  Residual risk: (1) post-processors that handle plain text or links (link previews, cards, tag
 *  plugins) keep running; a second line after rendering stays necessary. (2) A plugin that runs
 *  code on plain-text patterns without any code element is not covered (none known). Templater
 *  syntax `<% … %>` is broken by the HTML escape; `{{ … }}` is run by no known processor while
 *  rendering. */

const BACKTICK = /`/g;
const TILDE_RUN = /~{3,}/g;

/** Macht Modell-Markdown unschädlich für Renderer und Prozessoren (s. Kopfkommentar). */
export function neutralizeModelMarkdown(text: string): string {
  return text
    .replace(/!\[\[([^\]\n\r]*)\]\]/g, (_m, inner: string) => `\\[\\[${inner}\\]\\]`)
    .replace(/!\[([^\]]*)\]\(([^)\n\r]*)\)/g, (_m, alt: string, url: string) => `${alt} (${url})`)
    .replace(/!\[([^\]]*)\](?:\[[^\]]*\])?/g, "[$1]")
    .replace(/!\[/g, "[")
    .replace(/</g, "&lt;")
    .replace(BACKTICK, "ˋ")
    .replace(TILDE_RUN, (run) => "˜".repeat(run.length));
}
