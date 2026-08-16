// KI-Deutung: Endpunkte (Zeilen-Editor), Modell + Kontextlänge, Prompts, Thinking.
import { type Setting, getLanguage } from "obsidian";
import { pickLang, t } from "../../vendor/kit/i18n";
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { isAlwaysOnThinker } from "../../vendor/kit/reasoning";
import { settingBodyHost } from "../../vendor/kit-obsidian/settings_walker";
import { PROMPT_PRESETS } from "../../core/llm/prompt-presets";
import { DEFAULT_SYSTEM_PROMPT } from "../../core/llm/defaults";
import { type LlmSettings, effectiveModel } from "../../core/llm/settings-defaults";
import { ChatClient } from "../chat-client";
import { fetchModelContext, httpGet } from "../http";
import { buildEndpointList } from "./endpoint-list";
import { type SectionCtx, type SettingRow } from "./section-ctx";

export function llmRows(ctx: SectionCtx): SettingRow[] {
  const llm: LlmSettings = ctx.host.settings.llm;
  const uiLang = pickLang(getLanguage());

  // Always-on-Reasoner (R1 & Co.) ignorieren Suppress — der Toggle zeigte hier bis 0.3.0
  // fälschlich "aus" an. Ein Regler, der nichts bewirkt, ist ein Versprechen ohne Deckung:
  // deshalb in diesem Fall eine deaktivierte Hatch statt eines echten Controls.
  const always = isAlwaysOnThinker(llm.model);

  return [
    {
      name: t("set.llmEndpoints"),
      desc: t("set.llmEndpointsDesc"),
      // Der Zeilen-Editor ist eine ganze Liste, keine einzelne Zeile — settingBodyHost macht
      // die Setting-Zeile zum leeren Block-Container, in den er seine Zeilen zeichnet.
      render: (setting: Setting) => {
        buildEndpointList(settingBodyHost(setting), {
          list: llm.endpoints,
          name: t("set.llmEndpoints"),
          desc: t("set.llmEndpointsDesc"),
          setList: (next) => {
            llm.endpoints = next;
          },
          probe: (ep) => ctx.host.probeEndpoint(ep),
          commit: () => {
            ctx.save();
            ctx.rerender();
          },
        });
      },
    },
    {
      name: t("set.llmApiKey"),
      control: { type: "text", key: "llm.apiKey" },
    },
    {
      name: t("set.llmModel"),
      desc: t("set.llmModelDesc"),
      render: (setting: Setting) => renderModelField(setting, ctx, llm),
    },
    {
      name: t("set.llmPreset"),
      desc: t("set.llmPresetDesc"),
      // Kein Settings-Wert, sondern eine Aktion: das Dropdown füllt beide Prompt-Felder und
      // steht danach wieder auf "wählen". Deshalb Hatch statt Control.
      render: (setting: Setting) => {
        setting.addDropdown((d) => {
          d.addOption("", t("set.llmPresetChoose"));
          for (const p of PROMPT_PRESETS) d.addOption(p.id, p.label[uiLang]);
          d.setValue("");
          d.onChange((id) => {
            const preset = PROMPT_PRESETS.find((p) => p.id === id);
            if (!preset) return;
            llm.systemPromptDe = preset.body.de;
            llm.systemPromptEn = preset.body.en;
            ctx.save();
            ctx.rerender();
          });
        });
      },
    },
    promptRow(ctx, t("set.llmSysDe"), "llm.systemPromptDe", () => llm.systemPromptDe, DEFAULT_SYSTEM_PROMPT.de),
    promptRow(ctx, t("set.llmSysEn"), "llm.systemPromptEn", () => llm.systemPromptEn, DEFAULT_SYSTEM_PROMPT.en),
    always ?
      {
        name: t("set.llmThinking"),
        desc: t("set.llmThinkingAlways"),
        render: (setting: Setting) => {
          setting.addToggle((tg) => tg.setValue(true).setDisabled(true));
        },
      }
    : {
        name: t("set.llmThinking"),
        desc: t("set.llmThinkingDesc"),
        control: { type: "toggle", key: "llm.requestThinking" },
      },
    {
      name: t("set.llmThinkNote"),
      desc: t("set.llmThinkNoteDesc"),
      control: {
        type: "dropdown",
        key: "llm.thinkingInNote",
        options: {
          "closed-callout": t("set.thinkClosed"),
          "open-callout": t("set.thinkOpen"),
          text: t("set.thinkText"),
          none: t("set.thinkNone"),
        },
      },
    },
  ];
}

/** System-Prompt DE/EN: Textarea plus Reset-Knopf. Der Knopf hat keine deklarative
 *  Entsprechung neben einem Control, deshalb die ganze Zeile als Hatch. */
function promptRow(
  ctx: SectionCtx,
  name: string,
  key: "llm.systemPromptDe" | "llm.systemPromptEn",
  get: () => string,
  placeholder: string,
): SettingRow {
  return {
    name,
    render: (setting: Setting) => {
      setting
        .addTextArea((ta) => {
          ta.setPlaceholder(placeholder).setValue(get());
          ta.inputEl.rows = 4;
          ta.onChange((v) => {
            ctx.write(key, v);
          });
        })
        .addExtraButton((btn) =>
          btn
            .setIcon("rotate-ccw")
            .setTooltip(t("set.llmReset"))
            .onClick(() => {
              ctx.write(key, "");
              ctx.rerender();
            }),
        );
    },
  };
}

/** Modell — Dropdown live aus listModels(), Fallback Textfeld; dazu die Kontextlänge.
 *  Basis ist der erste Listeneintrag: die Modell-Liste kommt ohnehin nur von einem
 *  erreichbaren Server, und der Zeilen-Editor markiert den aktiven Endpunkt separat. */
function renderModelField(modelSetting: Setting, ctx: SectionCtx, llm: LlmSettings): void {
  const primary = llm.endpoints[0] ?? "";

  void new ChatClient(primary, llm.model, httpGet).listModels().then((models) => {
    if (models.length) {
      // Dropdown-Default persistieren: ein leeres model bei vorhandener Liste würde sonst
      // im Dropdown zwar angezeigt, aber nie gespeichert → generateInterpretation-Guard.
      const resolved = effectiveModel(llm.model, models);
      if (resolved !== llm.model) {
        llm.model = resolved;
        ctx.save();
      }
      const list = models.includes(llm.model) ? models : [llm.model, ...models];
      modelSetting.addDropdown((d) => {
        for (const m of list) d.addOption(m, m);
        d.setValue(llm.model);
        d.onChange((v) => {
          ctx.write("llm.model", v); // schreibt und baut neu auf (Kontextlänge, Thinking-Zustand)
        });
      });

      // Kontextlänge — entfällt still, wenn der Server sie nicht liefert (Ollama/MLX/vLLM).
      void fetchModelContext(normalizeEndpoint(primary), llm.model).then((cx) => {
        const len = cx?.loadedContextLength ?? cx?.maxContextLength;
        if (len) modelSetting.setDesc(t("set.llmContext", len.toLocaleString()));
      });
    } else {
      modelSetting.setDesc(t("set.llmModelOffline"));
      modelSetting.addText((txt) =>
        txt.setValue(llm.model).onChange((v) => {
          // Direkt über die Registry, aber OHNE Neuaufbau: ein Rebuild bei jedem Tastendruck
          // nähme dem Feld den Fokus.
          llm.model = v.trim();
          ctx.save();
        }),
      );
      modelSetting.addButton((b) => b.setButtonText(t("set.llmLoadModels")).onClick(() => ctx.rerender()));
    }
  });
}
