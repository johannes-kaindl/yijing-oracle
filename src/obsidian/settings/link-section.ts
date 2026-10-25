// Linkschutz der Deutung: die zwei Schalter des Kits („Links und Bilder in Antworten“), beide aus. Die Zeilen und ihre Texte (EN/DE)
// kommen aus `link-settings`; hier steht nur, wohin sie schreiben.
import { getLang } from "../../vendor/kit/i18n";
import { linkSettingDefinitions } from "../../vendor/kit-obsidian/link-settings";
import { type SectionCtx, type SettingRow } from "./section-ctx";

export function linkRows(ctx: SectionCtx): SettingRow[] {
  const s = ctx.host.settings;
  return linkSettingDefinitions({
    allowObsidianLinks: s.allowObsidianLinks,
    allowLocalImages: s.allowLocalImages,
    strings: { lang: getLang() },
    heading: false,
    onChange: (key, value) => {
      ctx.host.settings[key] = value;
      ctx.save();
    },
  });
}
