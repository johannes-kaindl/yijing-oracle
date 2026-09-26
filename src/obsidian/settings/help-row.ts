// Hilfe-Zeile der Settings (UI-STANDARD §8): Doku-Index und Issues dieses Repos, Texte aus i18n.
import { t } from "../../vendor/kit/i18n";
import { githubHelpUrls, helpSettingDefinition, type HelpSettingOptions } from "../../vendor/kit-obsidian/help-setting";

/** GitHub-Repo-Name, nicht die Plugin-ID (beide heissen hier gleich). */
export const HELP_REPO = "yijing-oracle";

export function helpOptions(open?: (url: string) => void): HelpSettingOptions {
  return {
    ...githubHelpUrls(HELP_REPO),
    texts: {
      name: t("set.help.name"),
      desc: t("set.help.desc"),
      openDocs: t("set.help.openDocs"),
      reportIssue: t("set.help.reportIssue"),
    },
    open,
  };
}

/** Erstes Element von `getSettingDefinitions()`; der Walker-Fallback (< 1.13) zeichnet es mit. */
export function helpDefinition() {
  return helpSettingDefinition(helpOptions());
}
