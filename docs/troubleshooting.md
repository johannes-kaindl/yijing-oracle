# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text — then the cause and what to do. Problems with the meditation image have their own section in [Set up image generation](image-generation.md#troubleshooting). If yours is not here, see [Getting help](#getting-help).

## No endpoint reachable, or no model

> No endpoint reachable, or no model — check the settings.

**Cause:** **Interpret with AI** found no endpoint that answers, or the endpoint offers no model. The list under **AI interpretation → Endpoints** is tried top to bottom and the first reachable one wins.

**Fix:** start your server and load a model, then press **Test connections** in the settings. Each row says why it fails:

| Row status | Meaning |
|---|---|
| Connection refused — server not running or wrong port? | The server is off, or the port is wrong. |
| Unknown host — typo in the address? | The host name does not resolve. |
| Timed out — network unreachable (wrong network / VPN off?). | The machine is not reachable from here. |
| Responds, but is not an OpenAI-compatible endpoint — wrong path or service? | Something answers, but not a chat server. |
| Access denied — the API key is missing or invalid. | The server wants a key; enter it under **API key (optional)**. |

Local servers almost always need a port, for example `http://127.0.0.1:1234`. With the LLM Endpoint Manager installed the message reads "No endpoint from the LLM Endpoint Manager — check its settings." and the fix is in the manager, not here.

## Interpretation failed or blocked

> The endpoint answers the connection test but not the chat request from Obsidian. A local server usually needs CORS enabled for that — LM Studio: turn on “Enable CORS” in the server settings (or start it with `lms server start --cors`); Ollama: set `OLLAMA_ORIGINS`. The test button stays green either way — it takes a different route.

> Interpretation failed — check the endpoint in the settings.

**Cause:** the first message means the interpretation streams from Obsidian's renderer, which always sends `Origin: app://obsidian.md`, and most local servers reject that by default. The connection test sends no origin, so it passes anyway. The second message is any other failure of the request.

**Fix:** for the first, enable CORS on the server: LM Studio **Enable CORS** in the server settings, or `lms server start --cors`; Ollama `OLLAMA_ORIGINS=app://obsidian.md`, then restart it. For the second, check the endpoint and model in the settings and the developer console (Ctrl+Shift+I, or Cmd+Option+I on macOS).

## No interpretation received

> No interpretation received.

**Cause:** the model finished without any text — a reasoning model that spent its whole budget on thinking, or an empty answer.

**Fix:** switch **Request thinking** off under **AI interpretation**, or choose another model, and press **Interpret with AI** again.

## Reading saved as a new note instead

> No active note — saved as a new note instead.

**Cause:** **Insert** or **Cast a reading at the cursor** needs an open Markdown note to put the link into.

**Fix:** open a note and try again, or accept the new note.

## The reading could not be built

> Reading data looks corrupted — could not build the reading.

**Cause:** the bundled hexagram data could not be read for this cast.

**Fix:** reload the plugin (turn it off and on under **Settings → Community plugins**). If it persists, [open an issue](#getting-help).

## The image could not be saved

> Could not save the image attachment.

**Cause:** the generated image could not be written into the vault, for example because the attachment folder is not writable.

**Fix:** check the attachment folder in Obsidian's **Files and links** settings, then generate the image again.

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/yijing-oracle/issues) with your Obsidian version, the plugin version (Settings → Community plugins) and what you expected to happen.
