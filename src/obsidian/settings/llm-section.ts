// KI-Deutung: Verbindung (Quelle, Endpunkte, Anfrage), Modell + Kontextlänge, Prompts, Thinking.
import { type Setting, getLanguage } from "obsidian";
import { getLang, pickLang, t } from "../../vendor/kit/i18n";
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { settingBodyHost } from "../../vendor/kit-obsidian/settings_walker";
import { PROMPT_PRESETS } from "../../core/llm/prompt-presets";
import { DEFAULT_SYSTEM_PROMPT } from "../../core/llm/defaults";
import { type LlmSettings, effectiveModel } from "../../core/llm/settings-defaults";
import { fetchModelContext } from "../http";
import { authHeaders } from "../../vendor/kit/endpoint_config";
import { findEndpointManager } from "../../vendor/kit-obsidian/endpoint-source";
import { type SectionCtx, type SettingRow } from "./section-ctx";

export function llmRows(ctx: SectionCtx): SettingRow[] {
  const llm: LlmSettings = ctx.host.settings.llm;
  const uiLang = pickLang(getLanguage());

  return [
    {
      name: t("set.llmEndpoints"),
      desc: t("set.llmEndpointsDesc"),
      // Ein maskiertes Feld (API-Schlüssel je Endpunkt) ist schwerer wiederzufinden als ein
      // beschriftetes: der Wert ist unlesbar, es bleibt die Beschriftung — und die hängt an der
      // UI-Sprache. Diese Begriffe sind bewusst NICHT übersetzt: sie sind in beiden Sprachen die,
      // unter denen gesucht wird. Dazu die Begriffe des Abschnitts „Anfrage“ (er gehört zur Verbindung).
      aliases: ["api key", "api-key", "apikey", "token", "bearer", "schluessel", "schlüssel", "temperature", "thinking", "sampling"],
      // Die Verbindung zeichnet Quelle (Manager oder lokal), Endpunkt-Liste und den Abschnitt
      // „Anfrage“ in einem Zug. Sie leert ihren Container beim Neuzeichnen — deshalb ein eigener
      // Host (die Zeile selbst, zum Block-Container gemacht), nie der Tab.
      render: (setting: Setting) => {
        ctx.llm.renderSettings(settingBodyHost(setting), { lang: getLang() });
      },
    },
    // Bei aktivem Manager sitzt die Modellwahl bereits in der Endpunkt-Zeile oben
    // (buildEndpointSourceSection) — eine zweite Modell-UI hier waere eine zweite Wahrheit.
    findEndpointManager(ctx.app)
      ? {
          name: t("set.llmModel"),
          desc: t("src.modelManaged"),
          render: () => {},
        }
      : {
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

/** Modell — Dropdown live aus der Verbindung, Fallback Textfeld; dazu die Kontextlänge.
 *  Die Liste kommt von dem Endpunkt, den die Verbindung gerade aufgelöst hat (der erste
 *  erreichbare), nicht vom ersten Listeneintrag: ein toter erster Eintrag lieferte sonst eine
 *  leere Liste, obwohl der zweite antwortet. */
function renderModelField(modelSetting: Setting, ctx: SectionCtx, llm: LlmSettings): void {
  void Promise.all([ctx.llm.models(), ctx.llm.resolve()]).then(([{ models }, source]) => {
    if (models.length) {
      // Dropdown-Default persistieren: ein leeres model bei vorhandener Liste würde sonst
      // im Dropdown zwar angezeigt, aber nie gespeichert → generateInterpretation-Guard.
      const resolved = effectiveModel(llm.model, models);
      if (resolved !== llm.model) {
        llm.model = resolved;
        ctx.save();
        ctx.llm.invalidate();
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
      const cfg = source.config;
      if (cfg) {
        void fetchModelContext(normalizeEndpoint(cfg.url), llm.model, authHeaders(cfg.apiKey)).then((cx) => {
          const len = cx?.loadedContextLength ?? cx?.maxContextLength;
          if (len) modelSetting.setDesc(t("set.llmContext", len.toLocaleString()));
        });
      }
    } else {
      modelSetting.setDesc(t("set.llmModelOffline"));
      modelSetting.addText((txt) =>
        txt.setValue(llm.model).onChange((v) => {
          // Direkt über die Registry, aber OHNE Neuaufbau: ein Rebuild bei jedem Tastendruck
          // nähme dem Feld den Fokus.
          llm.model = v.trim();
          ctx.save();
          ctx.llm.invalidate();
        }),
      );
      modelSetting.addButton((b) => b.setButtonText(t("set.llmLoadModels")).onClick(() => { ctx.llm.invalidate(); ctx.rerender(); }));
    }
  });
}
