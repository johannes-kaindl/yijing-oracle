# Image generation setup (meditation image)

The plugin can generate one meditation image per reading — a scene composed from
the hexagram's curated image motif (e.g. *"a vivid green seedling splitting cracked
earth"*), the resulting hexagram's motif, and a mood-matched atmosphere. The image
is previewed in the panel and embedded into the reading note as a vault attachment.

**Local-first by design:** the plugin ships no models and runs no inference itself.
It talks to an image server that is already running on your machine (or LAN) via
the **A1111-compatible HTTP API** (`POST /sdapi/v1/txt2img`). If no endpoint is
configured, the feature is invisible — nothing changes in the plugin.

## Supported backends

Anything that speaks the A1111 (AUTOMATIC1111) web-UI API:

| Backend | Notes |
|---|---|
| **[Draw Things](https://drawthings.ai)** (macOS/iOS) | Recommended on Apple Silicon. Free, App Store, manages model downloads itself, has a built-in API server. |
| AUTOMATIC1111 / Forge / SD.Next | Start with `--api`; default port 7860. |
| ComfyUI | **Not supported** (different, workflow-based API). May come later as a second adapter. |

## Setup with Draw Things (recommended)

1. **Install Draw Things** — Mac App Store or <https://drawthings.ai>.
2. **Download a model** in Draw Things (its model manager handles this; any
   Stable-Diffusion-family model works — pick one that suits your machine).
3. **Enable the API server**: in Draw Things, open the settings and enable
   **API Server** (HTTP). Default is `127.0.0.1:7860` — keep that unless it
   collides with something else.
4. **Configure the plugin**: Obsidian → Settings → Yijing Oracle →
   *Image generation* → set **Image endpoint** to `http://127.0.0.1:7860`.
5. Cast a reading in the panel → a **Generate image** button appears below the
   AI-interpretation box.

> Draw Things applies some of its own app-side settings (sampler, etc.) to API
> requests. The plugin sends prompt, negative prompt, size, steps and seed.

## How the image is composed

- Each of the 64 hexagrams carries a curated, language-independent **image motif**
  (`image_association` in the bundled data).
- Scene = primary motif + resulting motif (as background) + an atmosphere phrase
  that matches the motif's mood (dark motifs never get "warm golden light").
- The atmosphere and the seed are derived **deterministically from your question**
  (djb2 hash): the same cast with the same question reproduces the same image.
- The **Regenerate** button below the image generates a new take with a
  **random seed**.
- Your configurable **style suffix** (default: *ink wash painting, soft light,
  muted colors*) and **negative prompt** are appended from the settings.

## Settings reference

| Setting | Default | Meaning |
|---|---|---|
| Image endpoint | *(empty = off)* | Base URL of the A1111-compatible server. |
| Style suffix | `ink wash painting, soft light, muted colors` | Appended to the scene prompt. |
| Negative prompt | `text, watermark, signature, frame, border, lowres, blurry` | Sent as `negative_prompt`. |
| Image size | 768 × 768 | Square; 512/768/1024. |

Steps are fixed at 28; there is deliberately no sampler setting (YAGNI — the
backend's own defaults apply).

## Saving

When you save a reading that has a generated image, the PNG is stored via
Obsidian's own attachment-folder preference (Settings → Files & Links) and
embedded in the note under the **Meditation image** callout (configurable in the
plugin's note-layout settings, section *artwork*). Re-saving the same reading does
not duplicate the attachment; regenerating and saving again attaches the new image.

## Troubleshooting

- **No "Generate image" button** — the *Image endpoint* setting is empty, or you
  haven't cast a reading yet.
- **"Image generation failed: txt2img HTTP …"** — the server is reachable but
  rejected the request; check that a model is loaded in the backend.
- **"Image generation failed: timeout after 180000 ms"** — generation took longer
  than 3 minutes; use a smaller size or a faster model.
- **Failed instantly** — no server is listening on the endpoint. Start Draw Things
  and check the API server toggle. Quick test in a terminal:

  ```bash
  curl -s http://127.0.0.1:7860/sdapi/v1/options >/dev/null && echo up || echo down
  ```

- **Mobile** — works if an image server is reachable on your LAN (use the
  server machine's IP as endpoint). Without an endpoint the feature stays off.
