# Image generation setup (meditation image)

The plugin can generate one meditation image per reading — a scene composed from the hexagram's curated image motif (e.g. *"a vivid green seedling splitting cracked earth"*), the resulting hexagram's motif, and a mood-matched atmosphere. The image is previewed in the panel and embedded into the reading note.

**The images come from the Local Image Generator plugin.** Yijing Oracle ships no models, runs no inference and talks to no image server itself: it hands the prompt to the [Local Image Generator](https://github.com/johannes-kaindl/local-image-generator) plugin and shows the file that plugin writes into your vault. **Without Local Image Generator there are no images** — the image box does not appear in the panel, and nothing else in the plugin changes.

## Setup

1. **Install and enable Local Image Generator** (Settings → Community plugins → Browse). Set up its image backend there — its own documentation covers the built-in engine, Draw Things, AUTOMATIC1111/Forge, ComfyUI and the Apple Shortcut on iOS.
2. In Local Image Generator, make sure it reports itself as ready (its status in its settings or panel). Server address, image size, negative prompt, steps and workflow all live there; Yijing Oracle sends only the prompt.
3. Cast a reading in the Yijing Oracle panel. A **Meditation image** box with a **Generate image** button appears below the AI-interpretation box.

In **Settings → Yijing Oracle → Image generation**, the row *Image source* tells you whether the plugin found Local Image Generator.

## Coming from an earlier version

Until 0.14 the plugin had its own image connection (A1111-compatible servers such as Draw Things, and ComfyUI with a workflow you pasted). That connection is gone, and so are its settings: backend, image endpoint, negative prompt, image size, steps, workflow and steps override. The old values are dropped from your settings file the next time the plugin loads. Your **style suffix** stays.

To keep your images: install Local Image Generator and point it at the same server. The workflow you pasted into Yijing Oracle belongs in Local Image Generator now (its ComfyUI mode takes your exported workflow the same way). The images you already saved in notes are ordinary files and stay where they are.

## How the image is composed

- Each of the 64 hexagrams carries a curated, language-independent **image motif** (`image_association` in the bundled data).
- Scene = primary motif + resulting motif (as background) + an atmosphere phrase that matches the motif's mood (dark motifs never get "warm golden light").
- The atmosphere is derived **deterministically from your question** (djb2 hash): the same cast with the same question gets the same scene.
- Your configurable **style suffix** (default: *ink wash painting, soft light, muted colors*) is appended to the scene.
- The seed and the size are chosen by Local Image Generator, not by Yijing Oracle. **Generate image** therefore does not reproduce an earlier image for the same question the way it did with the old built-in connection; **Regenerate** simply asks again.

## Where the files go

Local Image Generator writes the image into the **attachment folder** Obsidian would choose for a note in your readings folder (Settings → Files & links), before the reading note exists. When you save the reading, the note embeds that file under the **Meditation image** callout (configurable in the plugin's note-layout settings, section *artwork*). Saving does not copy the image.

An image you have not saved into a note is throw-away: **Regenerate** and a new cast move the previous unsaved image to the trash (through Obsidian's file manager, so your trash setting applies). An image that a saved note embeds is never removed by the plugin.

## Settings reference

| Setting | Default | Meaning |
|---|---|---|
| Image source | *(information)* | Whether Local Image Generator was found. |
| Style suffix | `ink wash painting, soft light, muted colors` | Appended to the scene prompt. |

## Troubleshooting

- **No "Generate image" button / no image box** — Local Image Generator is not installed or not enabled, or you have not cast a reading yet. The *Image source* row in the settings says which.
- **"Image generation failed: not ready: …"** — Local Image Generator is there but cannot generate yet (for example no model downloaded, or its image server is not running). Fix it in that plugin; the reason after "not ready" names what is missing.
- **"Image generation failed: generation already running"** — Local Image Generator is busy with another request. Wait for it to finish and try again.
- **"The image file is no longer in the vault"** — you moved or deleted the generated file before saving the reading. Generate again.
- **Mobile** — works wherever Local Image Generator works on your device (on iOS it uses an Apple Shortcut). Without it, the feature stays off.
