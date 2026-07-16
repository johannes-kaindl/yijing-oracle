// KI-Deutung: Endpunkte (Zeilen-Editor), Modell + Kontextlänge, Prompts, Thinking.
import { Setting, getLanguage } from "obsidian";
import { pickLang, t } from "../../vendor/kit/i18n";
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { isAlwaysOnThinker } from "../../vendor/kit/reasoning";
import { PROMPT_PRESETS } from "../../core/llm/prompt-presets";
import { DEFAULT_SYSTEM_PROMPT } from "../../core/llm/defaults";
import { type ThinkingInNote } from "../../core/llm/interpretation";
import { type LlmSettings, effectiveModel } from "../../core/llm/settings-defaults";
import { ChatClient } from "../chat-client";
import { fetchModelContext, httpGet } from "../http";
import { buildEndpointList } from "./endpoint-list";
import { type SectionCtx } from "./section-ctx";

export function renderLlmSection(containerEl: HTMLElement, ctx: SectionCtx): void {
  const llm: LlmSettings = ctx.host.settings.llm;

  buildEndpointList(containerEl, {
    list: llm.endpoints,
    name: t("set.llmEndpoints"),
    desc: t("set.llmEndpointsDesc"),
    setList: (next) => {
      llm.endpoints = next;
    },
    probe: (ep) => ctx.host.probeEndpoint(ep),
    commit: () => {
      void ctx.host.saveSettings().then(() => {
        ctx.rerender();
      });
    },
  });

  // API-Key (optional).
  new Setting(containerEl).setName(t("set.llmApiKey")).addText((txt) =>
    txt.setValue(llm.apiKey).onChange(async (v) => {
      llm.apiKey = v.trim();
      await ctx.host.saveSettings();
    }),
  );

  renderModelField(containerEl, ctx, llm);

  // Prompt-Vorlage laden (füllt beide System-Prompt-Felder; danach frei editierbar).
  const uiLang = pickLang(getLanguage());
  new Setting(containerEl)
    .setName(t("set.llmPreset"))
    .setDesc(t("set.llmPresetDesc"))
    .addDropdown((d) => {
      d.addOption("", t("set.llmPresetChoose"));
      for (const p of PROMPT_PRESETS) d.addOption(p.id, p.label[uiLang]);
      d.setValue("");
      d.onChange(async (id) => {
        const preset = PROMPT_PRESETS.find((p) => p.id === id);
        if (!preset) return;
        llm.systemPromptDe = preset.body.de;
        llm.systemPromptEn = preset.body.en;
        await ctx.host.saveSettings();
        ctx.rerender();
      });
    });

  // System-Prompts DE/EN (leer = Default) + Reset.
  const promptRow = (name: string, get: () => string, set: (v: string) => void, placeholder: string): void => {
    new Setting(containerEl)
      .setName(name)
      .addTextArea((ta) => {
        ta.setPlaceholder(placeholder).setValue(get());
        ta.inputEl.rows = 4;
        ta.onChange(async (v) => {
          set(v);
          await ctx.host.saveSettings();
        });
      })
      .addExtraButton((btn) =>
        btn
          .setIcon("rotate-ccw")
          .setTooltip(t("set.llmReset"))
          .onClick(async () => {
            set("");
            await ctx.host.saveSettings();
            ctx.rerender();
          }),
      );
  };
  promptRow(t("set.llmSysDe"), () => llm.systemPromptDe, (v) => (llm.systemPromptDe = v), DEFAULT_SYSTEM_PROMPT.de);
  promptRow(t("set.llmSysEn"), () => llm.systemPromptEn, (v) => (llm.systemPromptEn = v), DEFAULT_SYSTEM_PROMPT.en);

  // Thinking anfordern. Always-on-Reasoner (R1 & Co.) ignorieren Suppress — der Toggle zeigte
  // hier bisher fälschlich "aus" an. Toggle deaktivieren und den Grund benennen.
  const always = isAlwaysOnThinker(llm.model);
  new Setting(containerEl)
    .setName(t("set.llmThinking"))
    .setDesc(always ? t("set.llmThinkingAlways") : t("set.llmThinkingDesc"))
    .addToggle((tg) =>
      tg
        .setValue(always ? true : llm.requestThinking)
        .setDisabled(always)
        .onChange(async (v) => {
          llm.requestThinking = v;
          await ctx.host.saveSettings();
        }),
    );

  // Thinking → Note.
  new Setting(containerEl)
    .setName(t("set.llmThinkNote"))
    .setDesc(t("set.llmThinkNoteDesc"))
    .addDropdown((d) =>
      d
        .addOption("closed-callout", t("set.thinkClosed"))
        .addOption("open-callout", t("set.thinkOpen"))
        .addOption("text", t("set.thinkText"))
        .addOption("none", t("set.thinkNone"))
        .setValue(llm.thinkingInNote)
        .onChange(async (v) => {
          llm.thinkingInNote = v as ThinkingInNote;
          await ctx.host.saveSettings();
        }),
    );
}

/** Modell — Dropdown live aus listModels(), Fallback Textfeld; dazu die Kontextlänge.
 *  Basis ist der erste Listeneintrag: die Modell-Liste kommt ohnehin nur von einem
 *  erreichbaren Server, und der Zeilen-Editor markiert den aktiven Endpunkt separat. */
function renderModelField(containerEl: HTMLElement, ctx: SectionCtx, llm: LlmSettings): void {
  const primary = llm.endpoints[0] ?? "";
  const modelSetting = new Setting(containerEl).setName(t("set.llmModel")).setDesc(t("set.llmModelDesc"));

  void new ChatClient(primary, llm.model, httpGet).listModels().then(async (models) => {
    if (models.length) {
      // Dropdown-Default persistieren: ein leeres model bei vorhandener Liste würde sonst
      // im Dropdown zwar angezeigt, aber nie gespeichert → generateInterpretation-Guard.
      const resolved = effectiveModel(llm.model, models);
      if (resolved !== llm.model) {
        llm.model = resolved;
        await ctx.host.saveSettings();
      }
      const list = models.includes(llm.model) ? models : [llm.model, ...models];
      modelSetting.addDropdown((d) => {
        for (const m of list) d.addOption(m, m);
        d.setValue(llm.model);
        d.onChange(async (v) => {
          llm.model = v;
          await ctx.host.saveSettings();
          ctx.rerender(); // Kontextlänge + Thinking-Zustand hängen am Modell
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
        txt.setValue(llm.model).onChange(async (v) => {
          llm.model = v.trim();
          await ctx.host.saveSettings();
        }),
      );
      modelSetting.addButton((b) => b.setButtonText(t("set.llmLoadModels")).onClick(() => ctx.rerender()));
    }
  });
}
