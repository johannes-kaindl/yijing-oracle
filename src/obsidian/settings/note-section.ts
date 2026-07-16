// Sektionen rund um Orakel-Grundlagen, Ablage und Notiz-Inhalt. Dünn: nur Setting-Aufrufe,
// keine Entscheidungslogik (UI-STANDARD §6).
import { Setting } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { type Register } from "../../core/data";
import { MARKER_KEY } from "../../core/frontmatter";
import { DEFAULT_FILENAME_TEMPLATE } from "../../core/filename";
import { CALLOUT_SECTIONS } from "../../core/note-callouts";
import { DEFAULT_SETTINGS, type OutputMode, type PluginSettings } from "../../core/settings";
import { type SectionCtx } from "./section-ctx";

/** Allgemein: was geworfen und in welcher Sprache/Register gedeutet wird. */
export function renderGeneralSection(containerEl: HTMLElement, ctx: SectionCtx): void {
  const s = ctx.host.settings;

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
          await ctx.host.saveSettings();
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
          await ctx.host.saveSettings();
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
          await ctx.host.saveSettings();
        }),
    );
}

/** Notiz & Ablage: wohin die Reading-Note geschrieben wird und wie sie heißt. */
export function renderNoteStorageSection(containerEl: HTMLElement, ctx: SectionCtx): void {
  const s = ctx.host.settings;

  new Setting(containerEl)
    .setName(t("set.folder"))
    .setDesc(t("set.folderDesc"))
    .addText((txt) =>
      txt
        .setPlaceholder("Yijing/Readings")
        .setValue(s.readingsFolder)
        .onChange(async (v) => {
          s.readingsFolder = v.trim() || DEFAULT_SETTINGS.readingsFolder;
          await ctx.host.saveSettings();
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
          await ctx.host.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName(t("set.openAfter"))
    .setDesc(t("set.openAfterDesc"))
    .addToggle((tg) =>
      tg.setValue(s.openAfterCreate).onChange(async (v) => {
        s.openAfterCreate = v;
        await ctx.host.saveSettings();
      }),
    );
}

/** Notiz-Inhalt: was in der Note steht — Frontmatter, Wilhelms Fußnoten, Callout-Wrapping. */
export function renderNoteContentSection(containerEl: HTMLElement, ctx: SectionCtx): void {
  const s = ctx.host.settings;

  // ── Frontmatter ────────────────────────────────────────────────────────────
  new Setting(containerEl).setName(t("set.fmHead")).setHeading();

  new Setting(containerEl)
    .setName(t("set.fmInclude"))
    .setDesc(t("set.fmIncludeDesc", MARKER_KEY))
    .addToggle((tg) =>
      tg.setValue(s.includeFrontmatter).onChange(async (v) => {
        s.includeFrontmatter = v;
        await ctx.host.saveSettings();
        ctx.rerender(); // Feld-Zeilen ein-/ausblenden
      }),
    );

  if (s.includeFrontmatter) {
    for (const f of s.frontmatterFields) {
      new Setting(containerEl)
        .setName(t(`fm.${f.id}`))
        .addText((txt) =>
          txt.setValue(f.key).onChange(async (v) => {
            f.key = v.trim() || f.id;
            await ctx.host.saveSettings();
          }),
        )
        .addToggle((tg) =>
          tg.setValue(f.enabled).onChange(async (v) => {
            f.enabled = v;
            await ctx.host.saveSettings();
          }),
        );
    }
  }

  // ── Fußnoten ───────────────────────────────────────────────────────────────
  new Setting(containerEl)
    .setName(t("set.showNotes"))
    .setDesc(t("set.showNotesDesc"))
    .addToggle((tg) =>
      tg.setValue(s.showNotes).onChange(async (v) => {
        s.showNotes = v;
        await ctx.host.saveSettings();
      }),
    );

  // ── Callouts ───────────────────────────────────────────────────────────────
  new Setting(containerEl).setName(t("set.calloutHead")).setHeading();
  new Setting(containerEl).setDesc(t("set.calloutDesc"));

  for (const key of CALLOUT_SECTIONS) {
    const opt = s.callouts[key];
    new Setting(containerEl)
      .setName(t(`set.callout.${key}`))
      .addText((txt) =>
        txt
          .setPlaceholder("quote")
          .setValue(opt.type)
          .onChange(async (v) => {
            opt.type = v.trim() || "quote";
            await ctx.host.saveSettings();
          }),
      )
      .addToggle((tg) =>
        tg.setValue(opt.enabled).onChange(async (v) => {
          opt.enabled = v;
          await ctx.host.saveSettings();
        }),
      );
  }
}
