import { type App, Notice, type Plugin, PluginSettingTab, Setting, getLanguage } from "obsidian";
import { pickLang, t } from "../vendor/kit/i18n";
import { PROMPT_PRESETS } from "../core/llm/prompt-presets";
import { type Lang, type Register } from "../core/data";
import { DEFAULT_FRONTMATTER_FIELDS, MARKER_KEY, type FrontmatterField } from "../core/frontmatter";
import { DEFAULT_FILENAME_TEMPLATE } from "../core/filename";
import { DEFAULT_SYSTEM_PROMPT } from "../core/llm/defaults";
import { type ThinkingInNote } from "../core/llm/interpretation";
import { type CalloutConfig, CALLOUT_SECTIONS, DEFAULT_CALLOUTS } from "../core/note-callouts";
import { type LlmSettings, DEFAULT_LLM_SETTINGS, effectiveModel } from "../core/llm/settings-defaults";
import { parseEndpointList, normalizeEndpoint } from "../vendor/kit/endpoint";
import { ChatClient } from "./chat-client";
import { httpGet, probeEndpoint } from "./http";

export type { LlmSettings } from "../core/llm/settings-defaults";
export { DEFAULT_LLM_SETTINGS } from "../core/llm/settings-defaults";

export type OutputMode = "note" | "cursor";

export interface PluginSettings {
  /** "auto" folgt der Obsidian-Sprache; sonst feste Reading-Sprache. */
  readingLang: "auto" | Lang;
  register: Register;
  defaultOutput: OutputMode;
  readingsFolder: string;
  /** Dateiname-Schema mit Platzhaltern ({date} {time} {hex} {resulting} {hexpair} {question}). */
  filenameTemplate: string;
  openAfterCreate: boolean;
  /** Frontmatter überhaupt anlegen? */
  includeFrontmatter: boolean;
  /** Pro Key: Name + Aktiv-Haken. */
  frontmatterFields: FrontmatterField[];
  /** LLM-Deutungs-Konfiguration. */
  llm: LlmSettings;
  /** Callout-Wrapping der Wilhelm-Abschnitte in der Note. */
  callouts: CalloutConfig;
  /** Wilhelms Fußnoten als Anmerkungen-Abschnitt in die Note schreiben. */
  showNotes: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  readingLang: "auto",
  register: "neutral",
  defaultOutput: "note",
  readingsFolder: "Yijing/Readings",
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  openAfterCreate: true,
  includeFrontmatter: true,
  frontmatterFields: DEFAULT_FRONTMATTER_FIELDS,
  llm: DEFAULT_LLM_SETTINGS,
  callouts: DEFAULT_CALLOUTS,
  showNotes: true,
};

/** Löst die effektive Reading-Sprache auf: "auto" → aus dem UI-Locale abgeleitet. */
export function resolveReadingLang(settings: PluginSettings, uiLocale?: string | null): Lang {
  return settings.readingLang === "auto" ? pickLang(uiLocale) : settings.readingLang;
}

export interface SettingsHost {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

export class SettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly host: SettingsHost,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.host.settings;

    new Setting(containerEl)
      .setName(t("set.readingLang"))
      .setDesc(t("set.readingLangDesc"))
      .addDropdown((d) =>
        d
          .addOption("auto", t("set.langAuto"))
          .addOption("de", "Deutsch")
          .addOption("en", "English")
          .setValue(s.readingLang)
          .onChange(async (v) => {
            s.readingLang = v as PluginSettings["readingLang"];
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.register"))
      .setDesc(t("set.registerDesc"))
      .addDropdown((d) =>
        d
          .addOption("classic", t("set.regClassic"))
          .addOption("neutral", t("set.regNeutral"))
          .setValue(s.register)
          .onChange(async (v) => {
            s.register = v as Register;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.output"))
      .setDesc(t("set.outputDesc"))
      .addDropdown((d) =>
        d
          .addOption("note", t("set.outNote"))
          .addOption("cursor", t("set.outCursor"))
          .setValue(s.defaultOutput)
          .onChange(async (v) => {
            s.defaultOutput = v as OutputMode;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.folder"))
      .setDesc(t("set.folderDesc"))
      .addText((txt) =>
        txt
          .setPlaceholder("Yijing/Readings")
          .setValue(s.readingsFolder)
          .onChange(async (v) => {
            s.readingsFolder = v.trim() || DEFAULT_SETTINGS.readingsFolder;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.filename"))
      .setDesc(t("set.filenameDesc"))
      .addText((txt) =>
        txt
          .setPlaceholder(DEFAULT_FILENAME_TEMPLATE)
          .setValue(s.filenameTemplate)
          .onChange(async (v) => {
            s.filenameTemplate = v.trim() || DEFAULT_FILENAME_TEMPLATE;
            await this.host.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("set.openAfter"))
      .setDesc(t("set.openAfterDesc"))
      .addToggle((tg) =>
        tg.setValue(s.openAfterCreate).onChange(async (v) => {
          s.openAfterCreate = v;
          await this.host.saveSettings();
        }),
      );

    // ── Frontmatter ─────────────────────────────────────────────────────────
    new Setting(containerEl).setName(t("set.fmHead")).setHeading();

    new Setting(containerEl)
      .setName(t("set.fmInclude"))
      .setDesc(t("set.fmIncludeDesc", MARKER_KEY))
      .addToggle((tg) =>
        tg.setValue(s.includeFrontmatter).onChange(async (v) => {
          s.includeFrontmatter = v;
          await this.host.saveSettings();
          this.display(); // Feld-Zeilen ein-/ausblenden
        }),
      );

    if (s.includeFrontmatter) {
      for (const f of s.frontmatterFields) {
        new Setting(containerEl)
          .setName(t(`fm.${f.id}`))
          .addText((txt) =>
            txt.setValue(f.key).onChange(async (v) => {
              f.key = v.trim() || f.id;
              await this.host.saveSettings();
            }),
          )
          .addToggle((tg) =>
            tg.setValue(f.enabled).onChange(async (v) => {
              f.enabled = v;
              await this.host.saveSettings();
            }),
          );
      }
    }

    new Setting(containerEl)
      .setName(t("set.showNotes"))
      .setDesc(t("set.showNotesDesc"))
      .addToggle((tg) =>
        tg.setValue(s.showNotes).onChange(async (v) => {
          s.showNotes = v;
          await this.host.saveSettings();
        }),
      );

    this.renderLlmSettings(containerEl, s.llm);
    this.renderCalloutSettings(containerEl, s.callouts);
  }

  // ── Notiz-Layout (Callouts) ────────────────────────────────────────────────
  private renderCalloutSettings(containerEl: HTMLElement, callouts: CalloutConfig): void {
    new Setting(containerEl).setName(t("set.calloutHead")).setHeading();
    new Setting(containerEl).setDesc(t("set.calloutDesc"));

    for (const key of CALLOUT_SECTIONS) {
      const opt = callouts[key];
      new Setting(containerEl)
        .setName(t(`set.callout.${key}`))
        .addText((txt) =>
          txt
            .setPlaceholder("quote")
            .setValue(opt.type)
            .onChange(async (v) => {
              opt.type = v.trim() || "quote";
              await this.host.saveSettings();
            }),
        )
        .addToggle((tg) =>
          tg.setValue(opt.enabled).onChange(async (v) => {
            opt.enabled = v;
            await this.host.saveSettings();
          }),
        );
    }
  }

  // ── KI-Deutung ────────────────────────────────────────────────────────────
  private renderLlmSettings(containerEl: HTMLElement, llm: LlmSettings): void {
    new Setting(containerEl).setName(t("set.llmHead")).setHeading();

    // Endpunkte (Textarea, eine URL pro Zeile).
    new Setting(containerEl)
      .setName(t("set.llmEndpoints"))
      .setDesc(t("set.llmEndpointsDesc"))
      .addTextArea((ta) => {
        ta.setPlaceholder("http://localhost:1234").setValue(llm.endpoints);
        ta.inputEl.rows = 3;
        ta.onChange(async (v) => {
          llm.endpoints = v;
          const list = parseEndpointList(v);
          if (list.length && !list.includes(llm.activeEndpoint)) llm.activeEndpoint = list[0];
          await this.host.saveSettings();
        });
      });

    // Aktiver Endpunkt + Test.
    const endpoints = parseEndpointList(llm.endpoints);
    new Setting(containerEl)
      .setName(t("set.llmActive"))
      .addDropdown((d) => {
        for (const ep of endpoints) d.addOption(ep, ep);
        if (endpoints.length) {
          d.setValue(endpoints.includes(llm.activeEndpoint) ? llm.activeEndpoint : endpoints[0]);
        }
        d.onChange(async (v) => {
          llm.activeEndpoint = v;
          await this.host.saveSettings();
          this.display();
        });
      })
      .addButton((b) =>
        b.setButtonText(t("set.llmTest")).onClick(async () => {
          const status = await probeEndpoint(normalizeEndpoint(llm.activeEndpoint));
          new Notice(status.klartext);
        }),
      );

    // API-Key (optional).
    new Setting(containerEl)
      .setName(t("set.llmApiKey"))
      .addText((txt) =>
        txt.setValue(llm.apiKey).onChange(async (v) => {
          llm.apiKey = v.trim();
          await this.host.saveSettings();
        }),
      );

    // Modell — Dropdown live aus listModels(), Fallback Textfeld.
    const modelSetting = new Setting(containerEl).setName(t("set.llmModel")).setDesc(t("set.llmModelDesc"));
    void new ChatClient(llm.activeEndpoint, llm.model, httpGet).listModels().then(async (models) => {
      if (models.length) {
        // Dropdown-Default persistieren: ein leeres model bei vorhandener Liste würde sonst
        // im Dropdown zwar angezeigt, aber nie gespeichert → generateInterpretation-Guard.
        const resolved = effectiveModel(llm.model, models);
        if (resolved !== llm.model) {
          llm.model = resolved;
          await this.host.saveSettings();
        }
        const list = models.includes(llm.model) ? models : [llm.model, ...models];
        modelSetting.addDropdown((d) => {
          for (const m of list) d.addOption(m, m);
          d.setValue(llm.model);
          d.onChange(async (v) => {
            llm.model = v;
            await this.host.saveSettings();
          });
        });
      } else {
        modelSetting.setDesc(t("set.llmModelOffline"));
        modelSetting.addText((txt) =>
          txt.setValue(llm.model).onChange(async (v) => {
            llm.model = v.trim();
            await this.host.saveSettings();
          }),
        );
        modelSetting.addButton((b) => b.setButtonText(t("set.llmLoadModels")).onClick(() => this.display()));
      }
    });

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
          await this.host.saveSettings();
          this.display();
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
            await this.host.saveSettings();
          });
        })
        .addExtraButton((btn) =>
          btn
            .setIcon("rotate-ccw")
            .setTooltip(t("set.llmReset"))
            .onClick(async () => {
              set("");
              await this.host.saveSettings();
              this.display();
            }),
        );
    };
    promptRow(t("set.llmSysDe"), () => llm.systemPromptDe, (v) => (llm.systemPromptDe = v), DEFAULT_SYSTEM_PROMPT.de);
    promptRow(t("set.llmSysEn"), () => llm.systemPromptEn, (v) => (llm.systemPromptEn = v), DEFAULT_SYSTEM_PROMPT.en);

    // Thinking anfordern.
    new Setting(containerEl)
      .setName(t("set.llmThinking"))
      .setDesc(t("set.llmThinkingDesc"))
      .addToggle((tg) =>
        tg.setValue(llm.requestThinking).onChange(async (v) => {
          llm.requestThinking = v;
          await this.host.saveSettings();
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
            await this.host.saveSettings();
          }),
      );
  }
}
