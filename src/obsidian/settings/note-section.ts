// Sektionen rund um Orakel-Grundlagen, Ablage und Notiz-Inhalt. Dünn: nur Definitionen,
// keine Entscheidungslogik (UI-STANDARD §6) — Werte laufen über core/settings/controls.ts.
import { type Setting } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { MARKER_KEY } from "../../core/frontmatter";
import { DEFAULT_FILENAME_TEMPLATE } from "../../core/filename";
import { CALLOUT_SECTIONS } from "../../core/note-callouts";
import { type SectionCtx, type SettingRow } from "./section-ctx";

/** Allgemein: was geworfen und in welcher Sprache/Register gedeutet wird. */
export function generalRows(): SettingRow[] {
  return [
    {
      name: t("set.readingLang"),
      desc: t("set.readingLangDesc"),
      control: {
        type: "dropdown",
        key: "readingLang",
        options: { auto: t("set.langAuto"), de: "Deutsch", en: "English" },
      },
    },
    {
      name: t("set.register"),
      desc: t("set.registerDesc"),
      control: {
        type: "dropdown",
        key: "register",
        options: { classic: t("set.regClassic"), neutral: t("set.regNeutral") },
      },
    },
    {
      name: t("set.output"),
      desc: t("set.outputDesc"),
      control: {
        type: "dropdown",
        key: "defaultOutput",
        options: { note: t("set.outNote"), cursor: t("set.outCursor") },
      },
    },
  ];
}

/** Notiz & Ablage: wohin die Reading-Note geschrieben wird und wie sie heißt. */
export function noteStorageRows(): SettingRow[] {
  return [
    {
      name: t("set.folder"),
      desc: t("set.folderDesc"),
      // "folder" statt "text": ab 1.13 rendert Obsidian dafür ein Ordner-Control, im
      // Fallback hängt der Walker ein Ordner-Autocomplete ans Textfeld.
      control: { type: "folder", key: "readingsFolder", placeholder: "Yijing/Readings" },
    },
    {
      name: t("set.filename"),
      desc: t("set.filenameDesc"),
      control: { type: "text", key: "filenameTemplate", placeholder: DEFAULT_FILENAME_TEMPLATE },
    },
    {
      name: t("set.openAfter"),
      desc: t("set.openAfterDesc"),
      control: { type: "toggle", key: "openAfterCreate" },
    },
  ];
}

/** Notiz-Inhalt: Wilhelms Fußnoten. */
export function noteContentRows(): SettingRow[] {
  return [
    {
      name: t("set.showNotes"),
      desc: t("set.showNotesDesc"),
      control: { type: "toggle", key: "showNotes" },
    },
  ];
}

/** Frontmatter: Master-Schalter und — wenn er an ist — eine Zeile je Feld.
 *  Die Feld-Zeilen werden WEGGELASSEN statt per `visible` versteckt: der native
 *  1.13-Renderer wertet `visible` an Gruppen-Items nicht aus. */
export function frontmatterRows(ctx: SectionCtx): SettingRow[] {
  const s = ctx.host.settings;
  const rows: SettingRow[] = [
    {
      name: t("set.fmInclude"),
      desc: t("set.fmIncludeDesc", MARKER_KEY),
      control: { type: "toggle", key: "includeFrontmatter" },
    },
  ];
  if (!s.includeFrontmatter) return rows;

  // Hatch je Feld: Key-Textfeld UND Aktiv-Haken in einer Zeile — zwei Regler an einem
  // Schlüssel, den die Registry nicht führen kann (er hängt am Listen-Index).
  for (const f of s.frontmatterFields) {
    rows.push({
      name: t(`fm.${f.id}`),
      render: (setting: Setting) => {
        setting
          .addText((txt) =>
            txt.setValue(f.key).onChange((v) => {
              f.key = v.trim() || f.id;
              ctx.save();
            }),
          )
          .addToggle((tg) =>
            tg.setValue(f.enabled).onChange((v) => {
              f.enabled = v;
              ctx.save();
            }),
          );
      },
    });
  }
  return rows;
}

/** Callouts: eine Zeile je Wilhelm-Abschnitt (Callout-Typ + an/aus). */
export function calloutRows(ctx: SectionCtx): SettingRow[] {
  const s = ctx.host.settings;
  const rows: SettingRow[] = [
    { name: "", desc: t("set.calloutDesc"), searchable: false },
  ];

  for (const key of CALLOUT_SECTIONS) {
    const opt = s.callouts[key];
    rows.push({
      name: t(`set.callout.${key}`),
      render: (setting: Setting) => {
        setting
          .addText((txt) =>
            txt
              .setPlaceholder("quote")
              .setValue(opt.type)
              .onChange((v) => {
                opt.type = v.trim() || "quote";
                ctx.save();
              }),
          )
          .addToggle((tg) =>
            tg.setValue(opt.enabled).onChange((v) => {
              opt.enabled = v;
              ctx.save();
            }),
          );
      },
    });
  }
  return rows;
}
