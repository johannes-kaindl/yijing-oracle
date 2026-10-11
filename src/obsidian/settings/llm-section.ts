// KI-Deutung: Verbindung (Quelle, Endpunkte mit Modell je Zeile, Anfrage), Prompts, Thinking.
import { type Setting, getLanguage } from "obsidian";
import { getLang, pickLang, t } from "../../vendor/kit/i18n";
import { settingBodyHost } from "../../vendor/kit-obsidian/settings_walker";
import { PROMPT_PRESETS } from "../../core/llm/prompt-presets";
import { DEFAULT_SYSTEM_PROMPT } from "../../core/llm/defaults";
import { type LlmSettings } from "../../core/llm/settings-defaults";
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
