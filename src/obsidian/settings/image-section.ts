// Bildmeditation: der Bild-Server, die Größe und der Negativ-Prompt gehören local-image-generator; hier steht der Stil-Zusatz
// und der Hinweis, woher die Bilder kommen.
import { t } from "../../vendor/kit/i18n";
import { DEFAULT_IMAGE_SETTINGS } from "../../core/image-settings";
import { readImageGenApi } from "../../vendor/kit-obsidian/capability-apis";
import { type SectionCtx, type SettingRow } from "./section-ctx";

export function imageRows(ctx: SectionCtx): SettingRow[] {
  const vorhanden = readImageGenApi(ctx.app) !== null;
  return [
    {
      name: t("set.imgProvider"),
      desc: vorhanden ? t("set.imgProviderReady") : t("set.imgProviderMissing"),
    },
    {
      name: t("set.imgStyle"),
      desc: t("set.imgStyleDesc"),
      control: { type: "text", key: "image.styleSuffix", placeholder: DEFAULT_IMAGE_SETTINGS.styleSuffix },
    },
  ];
}
