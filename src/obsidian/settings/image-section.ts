// Bildmeditation: Backend-Wahl, Endpunkt (+ Verbindungstest), Workflow (ComfyUI),
// Stil, Negativ-Prompt, Größe.
import { Setting, setIcon } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { DEFAULT_IMAGE_SETTINGS, type ImageSettings } from "../../core/image-settings";
import { statusKindKey } from "../../core/settings/endpoint-editor-model";
import { inspectWorkflow, type WorkflowSlots } from "../../core/comfy/workflow";
import { probeComfyEndpoint, probeImageEndpoint } from "../http";
import { type SectionCtx } from "./section-ctx";

export function renderImageSection(containerEl: HTMLElement, ctx: SectionCtx): void {
  const img: ImageSettings = ctx.host.settings.image;
  const isComfy = img.backend === "comfyui";

  new Setting(containerEl)
    .setName(t("set.imgBackend"))
    .setDesc(t("set.imgBackendDesc"))
    .addDropdown((d) => {
      d.addOption("a1111", t("set.imgBackendA1111"));
      d.addOption("comfyui", t("set.imgBackendComfy"));
      d.setValue(img.backend);
      d.onChange(async (v) => {
        img.backend = v === "comfyui" ? "comfyui" : "a1111";
        await ctx.host.saveSettings();
        ctx.rerender(); // je Backend andere Felder
      });
    });

  // Single-Endpoint → Test-Button statt Zeilen-Editor. Der Platzhalter folgt dem Backend:
  // Draw Things lauscht auf :7860, ComfyUI Desktop auf :8000.
  const epSetting = new Setting(containerEl)
    .setName(t("set.imgEndpoint"))
    .setDesc(t("set.imgEndpointDesc"));

  const statusEl = epSetting.settingEl.createSpan({ cls: "yijing-ep-status" });

  epSetting
    .addText((txt) =>
      txt
        .setPlaceholder(isComfy ? "http://127.0.0.1:8000" : "http://127.0.0.1:7860")
        .setValue(img.endpoint)
        .onChange(async (v) => {
          img.endpoint = v.trim();
          await ctx.host.saveSettings();
        }),
    )
    .addButton((b) =>
      b.setButtonText(t("set.imgTest")).onClick(async () => {
        if (!img.endpoint) return;
        statusEl.removeClass("is-ok", "is-error");
        statusEl.addClass("is-checking");
        setIcon(statusEl, "loader");
        statusEl.setAttribute("aria-label", t("set.ep.status.checking"));
        const base = normalizeEndpoint(img.endpoint);
        const status = isComfy ? await probeComfyEndpoint(base) : await probeImageEndpoint(base);
        statusEl.removeClass("is-checking");
        setIcon(statusEl, status.reachable ? "circle-check" : "circle-x");
        statusEl.addClass(status.reachable ? "is-ok" : "is-error");
        statusEl.setAttribute("aria-label", t(statusKindKey(status.kind)));
      }),
    );

  if (isComfy) renderComfyFields(containerEl, ctx, img);
  else renderA1111Fields(containerEl, ctx, img);

  new Setting(containerEl)
    .setName(t("set.imgStyle"))
    .setDesc(t("set.imgStyleDesc"))
    .addText((txt) =>
      txt
        .setPlaceholder(DEFAULT_IMAGE_SETTINGS.styleSuffix)
        .setValue(img.styleSuffix)
        .onChange(async (v) => {
          img.styleSuffix = v;
          await ctx.host.saveSettings();
        }),
    );

  new Setting(containerEl).setName(t("set.imgNegative")).addText((txt) =>
    txt
      .setPlaceholder(DEFAULT_IMAGE_SETTINGS.negativePrompt)
      .setValue(img.negativePrompt)
      .onChange(async (v) => {
        img.negativePrompt = v;
        await ctx.host.saveSettings();
      }),
  );

  new Setting(containerEl).setName(t("set.imgSize")).addDropdown((d) => {
    for (const px of [512, 768, 1024]) d.addOption(String(px), `${px} × ${px}`);
    d.setValue(String(img.size));
    d.onChange(async (v) => {
      img.size = Number(v);
      await ctx.host.saveSettings();
    });
  });
}

function renderA1111Fields(containerEl: HTMLElement, ctx: SectionCtx, img: ImageSettings): void {
  new Setting(containerEl)
    .setName(t("set.imgSteps"))
    .setDesc(t("set.imgStepsDesc"))
    .addText((txt) =>
      txt
        .setPlaceholder(String(DEFAULT_IMAGE_SETTINGS.steps))
        .setValue(String(img.steps))
        .onChange(async (v) => {
          const n = Number(v);
          img.steps = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_IMAGE_SETTINGS.steps;
          await ctx.host.saveSettings();
        }),
    );
}

function renderComfyFields(containerEl: HTMLElement, ctx: SectionCtx, img: ImageSettings): void {
  const wf = new Setting(containerEl)
    .setName(t("set.imgWorkflow"))
    .setDesc(t("set.imgWorkflowDesc"));

  const feedbackEl = wf.settingEl.createDiv({ cls: "yijing-workflow-status" });

  wf.addTextArea((ta) => {
    ta.setValue(img.comfyWorkflow).onChange(async (v) => {
      img.comfyWorkflow = v;
      await ctx.host.saveSettings();
      describeWorkflow(feedbackEl, v);
    });
    ta.inputEl.rows = 6;
  });

  describeWorkflow(feedbackEl, img.comfyWorkflow);

  const stepsSetting = new Setting(containerEl)
    .setName(t("set.imgStepsOverride"))
    .setDesc(t("set.imgStepsOverrideDesc"))
    .addText((txt) =>
      txt
        .setPlaceholder("—")
        .setValue(img.comfyStepsOverride === null ? "" : String(img.comfyStepsOverride))
        .onChange(async (v) => {
          const n = Number(v.trim());
          img.comfyStepsOverride =
            v.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : Math.floor(n);
          await ctx.host.saveSettings();
        }),
    );

  // Ein Eingabefeld, dessen Wert nirgends ankommt, ist ein Versprechen ohne Deckung —
  // deshalb deaktivieren statt den Wert still zu verwerfen.
  const slots = slotsOf(img.comfyWorkflow);
  if (slots && slots.stepsField === null) {
    stepsSetting.setDesc(t("set.imgStepsNoField"));
    stepsSetting.setDisabled(true);
  }
}

function slotsOf(json: string): WorkflowSlots | null {
  if (!json.trim()) return null;
  try {
    const r = inspectWorkflow(JSON.parse(json));
    return r.ok ? r.slots : null;
  } catch {
    return null;
  }
}

/** Rückmeldung unter der Textarea: erkannte Node-IDs oder der Grund des Scheiterns.
 *  Damit scheitert ein untauglicher Workflow beim Einrichten statt erst nach Minuten
 *  Wartezeit am fertigen Wurf. */
function describeWorkflow(el: HTMLElement, json: string): void {
  el.empty();
  el.removeClass("is-ok", "is-error");
  if (!json.trim()) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    el.addClass("is-error");
    el.setText(t("set.imgWorkflowErr.json"));
    return;
  }

  const r = inspectWorkflow(parsed);
  if (r.ok) {
    el.addClass("is-ok");
    el.setText(t("set.imgWorkflowOk", r.slots.positive, r.slots.negative, r.slots.latent, r.slots.sampler));
    return;
  }

  el.addClass("is-error");
  const detail =
    r.error.kind === "ambiguous-sampler" ? r.error.ids.join(", ")
    : r.error.kind === "dangling-ref" ? r.error.id
    : "";
  el.setText(t(`set.imgWorkflowErr.${r.error.kind}`, detail));
}
