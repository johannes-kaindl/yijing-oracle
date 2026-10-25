# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text — then the cause and what to do. Problems with the meditation image have their own section in [Set up image generation](image-generation.md#troubleshooting). If yours is not here, see [Getting help](#getting-help).

## No endpoint reachable, or no model

> No endpoint reachable, or no model — check the settings.

**Cause:** **Interpret with AI** found no endpoint that answers, or the endpoint offers no model. The list under **AI interpretation → Endpoints** is tried top to bottom and the first reachable one wins.

**Fix:** start your server and load a model, then press **Test connection** on the row in the settings. If the endpoint answers but the model is missing, pick one in the **model row** at the top of the panel (the reload button next to it asks the endpoint again). The row says why it fails:

| Row status | Meaning |
|---|---|
| Connection refused — server not running or wrong port. | The server is off, or the port is wrong. |
| Unknown host — typo in the address? | The host name does not resolve. |
| Timed out — network unreachable. | The machine is not reachable from here. |
| Answers, but is not an OpenAI-compatible endpoint. | Something answers, but not a chat server. |
| Access denied — API key missing or invalid. | The server wants a key; enter it in that row (**API key (optional)**, or **Change key** if one is saved). |

Local servers almost always need a port, for example `http://127.0.0.1:1234`. With the LLM Endpoint Manager installed the message reads "No endpoint from the LLM Endpoint Manager — check its settings." and the fix is in the manager, not here.

## Interpretation failed

> Interpretation failed — check the endpoint in the settings.

**Cause:** the chat request to the endpoint failed: the server is off or the port is wrong, the key is missing or invalid, or the model is not available. The connection test in the settings only checks that something answers; the chat request can still fail.

**Fix:** check the endpoint, key and model in the settings (**AI interpretation → Endpoints**) and the developer console (Ctrl+Shift+I, or Cmd+Option+I on macOS), then press **Interpret with AI** again.

## The model row is greyed out

> The model dropdown, the reload button and the thinking toggle at the top of the panel cannot be used.

**Cause:** an interpretation is starting or running; the row is locked until it ends. A start that stops early (no endpoint, no model) frees it again at once.

**Fix:** wait for the interpretation or press **Cancel**. For a Claude entry the thinking toggle offers no "off" and reads "Thinking: low" or higher: Claude models always think, so the plugin cannot switch it off.

## The interpretation appears all at once instead of streaming

There is no message for this. The answer shows up in one piece when it is done.

**Cause:** Obsidian's renderer always sends `Origin: app://obsidian.md`, and most local servers reject that by default (no CORS). The plugin notices the failed stream and repeats the request once without streaming, through Obsidian's own request function, which sends no `Origin`. The answer is complete, only the live view is missing. Measured against a server without any CORS headers: the first request is a blocked `OPTIONS` preflight with that `Origin`, the second a plain `POST` without it, and no notice appears.

**Fix:** only if you want the live stream: enable CORS on the server. LM Studio: **Enable CORS** in the server settings, or `lms server start --cors`; Ollama: `OLLAMA_ORIGINS=app://obsidian.md`, then restart it.

## No interpretation received

> No interpretation received.

**Cause:** the model finished without any text — a reasoning model that spent its whole budget on thinking, or an empty answer.

**Fix:** set the thinking level to **off** in the **Request** section under **AI interpretation**, or choose another model, and press **Interpret with AI** again.

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
