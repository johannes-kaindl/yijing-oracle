# Image generation setup (meditation image)

The plugin can generate one meditation image per reading — a scene composed from
the hexagram's curated image motif (e.g. *"a vivid green seedling splitting cracked
earth"*), the resulting hexagram's motif, and a mood-matched atmosphere. The image
is previewed in the panel and embedded into the reading note as a vault attachment.

**Local-first by design:** the plugin ships no models and runs no inference itself.
It talks to an image server that is already running on your machine (or LAN). If no
endpoint is configured, the feature is invisible — nothing changes in the plugin.

## Supported backends

Pick the backend in **Settings → Yijing Oracle → Image generation**; the fields below
it change accordingly.

| Backend | Notes |
|---|---|
| **[Draw Things](https://drawthings.ai)** (macOS/iOS) | Recommended on Apple Silicon. Free, App Store, manages model downloads itself, has a built-in API server. Speaks the A1111 API (`POST /sdapi/v1/txt2img`). |
| AUTOMATIC1111 / Forge / SD.Next | Same API. Start with `--api`; default port 7860. |
| **ComfyUI** | Workflow-based. You export your workflow once and the plugin fills in the prompt — see below. Desktop app defaults to port 8000, the standalone server to 8188. |

## Setup with Draw Things (recommended)

1. **Install Draw Things** — Mac App Store or <https://drawthings.ai>.
2. **Download a model** in Draw Things (its model manager handles this; any
   Stable-Diffusion-family model works — pick one that suits your machine).
3. **Enable the API server**: in Draw Things, open the settings and enable
   **API Server** (HTTP). Default is `127.0.0.1:7860` — keep that unless it
   collides with something else.
4. **Configure the plugin**: Obsidian → Settings → Yijing Oracle → *Image generation*
   → leave **Backend** on *A1111 / Draw Things* and set **Image endpoint** to
   `http://127.0.0.1:7860`. Hit **Test connection** — a green check means Draw Things
   is reachable; a red cross explains what went wrong (server not running, wrong
   port, …).
5. Cast a reading in the panel → a **Generate image** button appears below the
   AI-interpretation box.

> Draw Things applies some of its own app-side settings (sampler, etc.) to API
> requests. The plugin sends prompt, negative prompt, size, steps and seed.

## Setup with ComfyUI

ComfyUI has no fixed generate endpoint — everything runs through a workflow graph.
So instead of guessing one, the plugin uses **yours**.

1. **Build or open a workflow** in ComfyUI that produces an image you like. Any
   architecture works — SDXL, Flux, Z-Image Turbo — because the plugin reads the
   graph rather than assuming a shape.
2. **Export it**: *Workflow → Export (API)*. This is **not** the normal save format;
   the API format is the one keyed by node id. Open the file and copy its contents.
3. **Configure the plugin**: Settings → *Image generation* → set **Backend** to
   *ComfyUI*, **Image endpoint** to `http://127.0.0.1:8000` (Desktop app; the
   standalone server uses 8188), then paste the workflow into **Workflow (API format)**.
4. **Check the line under the box.** It reports which nodes were recognised —
   `Detected: prompt=6 · negative=7 · latent=5 · sampler=3` — or why it could not
   read the graph. A workflow that fails here would fail at generation time too, so
   this is the moment to fix it.
5. **Test connection**, then cast a reading and hit **Generate image**. Progress is
   shown step by step while it runs.

**What the plugin writes into your workflow:** the positive prompt, the negative
prompt, the seed, the image size and — only if you set the override — the steps.
Everything else is left exactly as you exported it: sampler, scheduler, CFG, LoRAs,
upscalers, post-processing.

**Steps:** leave the override empty and the value from your workflow wins. That
matters for turbo models — Z-Image Turbo wants roughly 4–8 steps, and forcing an
SDXL-style 28 on it would waste minutes per image.

**Known limits.** The plugin needs exactly **one** sampler node in the graph, since
that is what it follows to find the prompt and latent nodes. Refiner chains with two
samplers are reported as ambiguous rather than guessed at. If your sampler has no
steps field (`SamplerCustom` drives its schedule from a separate node), the override
is disabled instead of silently ignored.

> If you would rather not collect a second copy of every image in ComfyUI's output
> folder, end your workflow with **PreviewImage** instead of **SaveImage** — the
> plugin picks the image up either way.

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
| Backend | A1111 / Draw Things | Which API the server speaks. |
| Image endpoint | *(empty = off)* | Base URL of the image server. |
| Style suffix | `ink wash painting, soft light, muted colors` | Appended to the scene prompt. |
| Negative prompt | `text, watermark, signature, frame, border, lowres, blurry` | Sent as the negative prompt. |
| Image size | 768 × 768 | Square; 512/768/1024. |
| Steps *(A1111)* | 28 | Sampling steps. |
| Workflow *(ComfyUI)* | *(empty)* | Your exported graph, API format. |
| Override steps *(ComfyUI)* | *(empty)* | Empty = the workflow's own value wins. |

There is deliberately no sampler or CFG setting: with A1111 the backend's own
defaults apply, with ComfyUI your workflow decides.

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
  and check the API server toggle. Quickest check: **Test connection** in the
  *Image generation* settings — it names the cause (refused, unknown host,
  timeout). Equivalent in a terminal, if you prefer:

  ```bash
  curl -s http://127.0.0.1:7860/sdapi/v1/options >/dev/null && echo up || echo down
  ```

- **Mobile** — works if an image server is reachable on your LAN (use the
  server machine's IP as endpoint). Without an endpoint the feature stays off.
