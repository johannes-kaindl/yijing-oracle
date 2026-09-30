// uebernommen aus lingotuner/src/obsidian/settings-tab.ts (renderRequestSection), 2026-09-30
// Abschnitt „Anfrage" (Sampling-Profile, Modus creative): duenner Anschluss an das Kit-Modul
// `buildRequestSection`. Formuliert nichts selbst — Texte aus `src/i18n/strings.ts` (Praefix
// `request.`), Abweichungen aus `core/request-text.ts`.
import { type Setting } from "obsidian";
import { t } from "../../vendor/kit/i18n";
import { settingBodyHost } from "../../vendor/kit-obsidian/settings_walker";
import { buildRequestSection, type RequestSectionState } from "../../vendor/kit-obsidian/request-section";
import { type RequestSession } from "../../vendor/kit-obsidian/request-session";
import { BACKENDS, FAMILIES, type BackendId, type FamilyId, type RequestSettings } from "../../vendor/kit/sampling-profiles";
import { deviationDetail, fieldStateText } from "../../core/request-text";
import { MODE } from "../../core/llm/request-settings";
import { type SettingsHost } from "../../core/settings";

/** Was der Tab vom Plugin ueber `SettingsHost` hinaus braucht, um „Anfrage" zu zeigen. */
export interface RequestHost extends SettingsHost {
  requestSession: RequestSession;
  requestSectionState(): RequestSectionState;
  saveRequestSettings(next: RequestSettings): Promise<void>;
}

export function renderRequestSection(setting: Setting, host: RequestHost, rerender: () => void): void {
  buildRequestSection({
    containerEl: settingBodyHost(setting),
    modes: [MODE],
    state: () => host.requestSectionState(),
    settings: () => host.settings.request,
    save: (s) => host.saveRequestSettings(s),
    maxTokens: () => undefined,
    session: host.requestSession,
    rerender,
    strings: {
      title: t("request.title"),
      head: (family, familySource, backend, backendSource) => {
        const famLabel = family === "—" ? "—" : (FAMILIES[family as FamilyId]?.label ?? family);
        const backLabel = backend === "unknown" ? t("request.backend.unknown") : (BACKENDS[backend as BackendId]?.label ?? backend);
        return t("request.head", famLabel, t(`request.familySource.${familySource}`), backLabel, t(`request.backendSource.${backendSource}`));
      },
      unknownFamily: t("request.unknownFamily"),
      jitWarning: (model, defaultModel) => t("request.jitWarning", model, defaultModel),
      sentAs: (model) => t("request.sentAs", model),
      modeHeading: (mode) => t(`request.mode.${mode}`),
      fieldName: (field) => t(`request.field.${field}`),
      fieldDesc: (e) => fieldStateText(e),
      reset: t("request.reset"),
      thinkingLevel: t("request.thinkingLevel"),
      level: (l) => t(`request.level.${l}`),
      levelPicker: t("request.levelPicker"),
      levelPickerDesc: t("request.levelPickerDesc"),
      dormant: (fam) => t("request.dormant", fam === "unknown" ? t("request.familySource.none") : (FAMILIES[fam]?.label ?? fam)),
      deleteDormant: t("request.deleteDormant"),
      lastRequest: t("request.lastRequest"),
      lastRequestNone: t("request.lastRequestNone"),
      copy: t("request.copy"),
      copied: t("request.copied"),
      deviationsOk: t("request.deviationsOk"),
      deviationsWarn: (n) => t("request.deviationsWarn", String(n)),
      deviation: (kind, count, detail) => `${deviationDetail(kind, detail)} (${count}×)`,
    },
  });
}
