// Bildmeditation: Backend-Wahl, Endpunkt (+ Verbindungstest), Workflow (ComfyUI),
// Stil, Negativ-Prompt, Größe.
import { type Setting, setIcon } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { DEFAULT_IMAGE_SETTINGS, type ImageSettings } from "../../core/image-settings";
import { statusKindKey } from "../../core/settings/endpoint-editor-model";
import { inspectWorkflow, type WorkflowSlots } from "../../core/comfy/workflow";
import { probeComfyEndpoint, probeImageEndpoint } from "../http";
import { type SectionCtx, type SettingRow } from "./section-ctx";

export function imageRows(ctx: SectionCtx): SettingRow[] {
  const img: ImageSettings = ctx.host.settings.image;
  const isComfy = img.backend === "comfyui";

  const rows: SettingRow[] = [
    {
      name: t("set.imgBackend"),
      desc: t("set.imgBackendDesc"),
      control: {
        type: "dropdown",
        key: "image.backend",
        options: { a1111: t("set.imgBackendA1111"), comfyui: t("set.imgBackendComfy") },
      },
    },
    endpointRow(ctx, img, isComfy),
  ];

  // Backend-abhängige Zeilen werden weggelassen statt per `visible` versteckt — der native
  // 1.13-Renderer wertet `visible` an Gruppen-Items nicht aus.
  if (isComfy) rows.push(...comfyRows(ctx, img));
  else rows.push(a1111StepsRow());

  rows.push(
    {
      name: t("set.imgStyle"),
      desc: t("set.imgStyleDesc"),
      control: { type: "text", key: "image.styleSuffix", placeholder: DEFAULT_IMAGE_SETTINGS.styleSuffix },
    },
    {
      name: t("set.imgNegative"),
      control: {
        type: "text",
        key: "image.negativePrompt",
        placeholder: DEFAULT_IMAGE_SETTINGS.negativePrompt,
      },
    },
    {
      name: t("set.imgSize"),
      control: {
        type: "dropdown",
        key: "image.size",
        options: Object.fromEntries([512, 768, 1024].map((px) => [String(px), `${px} × ${px}`])),
      },
    },
  );

  return rows;
}

/** Single-Endpoint → Textfeld mit Test-Knopf und Status-Punkt statt Zeilen-Editor. Hatch,
 *  weil Status-Anzeige und Knopf zusammen an einer Zeile hängen. Der Platzhalter folgt dem
 *  Backend: Draw Things lauscht auf :7860, ComfyUI Desktop auf :8000. */
function endpointRow(ctx: SectionCtx, img: ImageSettings, isComfy: boolean): SettingRow {
  return {
    name: t("set.imgEndpoint"),
    desc: t("set.imgEndpointDesc"),
    render: (setting: Setting) => {
      const statusEl = setting.settingEl.createSpan({ cls: "yijing-ep-status" });

      setting
        .addText((txt) =>
          txt
            .setPlaceholder(isComfy ? "http://127.0.0.1:8000" : "http://127.0.0.1:7860")
            .setValue(img.endpoint)
            .onChange((v) => {
              ctx.write("image.endpoint", v);
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
    },
  };
}

function a1111StepsRow(): SettingRow {
  return {
    name: t("set.imgSteps"),
    desc: t("set.imgStepsDesc"),
    control: {
      type: "number",
      key: "image.steps",
      placeholder: String(DEFAULT_IMAGE_SETTINGS.steps),
    },
  };
}

function comfyRows(ctx: SectionCtx, img: ImageSettings): SettingRow[] {
  const slots = slotsOf(img.comfyWorkflow);
  const stepsFieldMissing = slots !== null && slots.stepsField === null;

  return [
    {
      name: t("set.imgWorkflow"),
      desc: t("set.imgWorkflowDesc"),
      // Hatch statt Textarea-Control: die Rückmeldung unter dem Feld aktualisiert sich bei
      // jedem Tastendruck. Als Control ginge das nur über einen Neuaufbau — der nähme dem
      // Feld mitten im Einfügen den Fokus.
      render: (setting: Setting) => {
        const feedbackEl = setting.settingEl.createDiv({ cls: "yijing-workflow-status" });
        setting.addTextArea((ta) => {
          ta.setValue(img.comfyWorkflow).onChange((v) => {
            ctx.write("image.comfyWorkflow", v);
            describeWorkflow(feedbackEl, v);
          });
          ta.inputEl.rows = 6;
        });
        describeWorkflow(feedbackEl, img.comfyWorkflow);
      },
    },
    {
      name: t("set.imgStepsOverride"),
      // Ein Eingabefeld, dessen Wert nirgends ankommt, ist ein Versprechen ohne Deckung —
      // deshalb deaktivieren statt den Wert still zu verwerfen.
      desc: stepsFieldMissing ? t("set.imgStepsNoField") : t("set.imgStepsOverrideDesc"),
      // Hatch statt "number"-Control: null ist hier ein gültiger Wert („der Workflow
      // gewinnt"), und ein Zahlen-Control kennt kein Leer.
      render: (setting: Setting) => {
        setting.addText((txt) =>
          txt
            .setPlaceholder("—")
            .setValue(img.comfyStepsOverride === null ? "" : String(img.comfyStepsOverride))
            .onChange((v) => {
              ctx.write("image.comfyStepsOverride", v);
            }),
        );
        if (stepsFieldMissing) setting.setDisabled(true);
      },
    },
  ];
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
