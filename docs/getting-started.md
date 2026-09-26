# Getting started

This walk-through takes you from a fresh install to your first saved reading. It needs about five minutes and nothing besides Obsidian — the hexagram data is bundled and casting works fully offline.

## 1. Install and enable the plugin

Follow one of the [install routes in the README](https://github.com/johannes-kaindl/yijing-oracle/blob/main/README.md#install), then enable **Yijing Oracle** under **Settings → Community plugins**.

## 2. Open the panel

Click the sparkles icon in the ribbon, or run **Open oracle panel** from the command palette. The panel opens in the sidebar.

## 3. Cast

1. Type a question into the field — or leave it empty; the panel says "Ask a question (or don't) and cast the coins."
2. Press **Cast the coins**. Three coins are thrown per line, six lines, bottom to top.
3. The panel shows the hexagram as six lines, its changing lines ("changing lines: …") and, when there are any, the resulting hexagram ("becomes …").

## 4. Save the reading

Press **Save**. The reading becomes a Markdown note in the folder set under **Settings → Yijing Oracle → Note & storage → Readings folder**, and a notice reads "Reading saved: …". **Insert** puts a link to the reading at the cursor of the note you have open instead; which of the two is the primary button is the **Default output** setting.

Saved readings are listed below the panel under **Past readings**. Clicking one reconstructs the cast from its frontmatter.

**New question** clears the field for the next cast.

## 5. Shortcuts without the panel

Two commands cast straight away, without a question: **Cast a reading into a new note** and **Cast a reading at the cursor**.

## Where to go next

- Choose the reading language, the classic (Wilhelm) or gender-neutral register and what goes into the note: **Settings → Yijing Oracle**, sections *General*, *Note & storage* and *Note content*.
- Add an optional local AI interpretation: enter an OpenAI-compatible server under **AI interpretation → Endpoints**. The server needs CORS enabled, see [Troubleshooting](troubleshooting.md#interpretation-failed-or-blocked).
- Add an optional meditation image: [Set up image generation](image-generation.md).
- Something went wrong? [Troubleshooting](troubleshooting.md).
