// vendored from obsidian-kit@0.72.0, src/obsidian/link-settings.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { Setting } from "obsidian";
import type { SettingDefinitionRender } from "obsidian";

/** UI-STANDARD §8 „Links und Bilder in Antworten“ (Einstellungszeile, seit 0.70.0): zwei Schalter, beide Default aus, die `DomGuardOptions.allowObsidianLinks` und
 *  `DomGuardOptions.allowLocalImages` des Chat-Fensters (`ChatWindowOptions.domGuard`) steuern. Native `Setting`, kein CSS. Texte kommen vom Plugin (das Kit bleibt i18n-frei);
 *  die EN/DE-Fassungen unten sind Vorgaben zum Durchreichen oder Überlagern (`strings: { lang: "de", heading: "…" }`, Teil-Merge wie bei `buildModelBar`).
 *
 *  DE-Wortlaut nach der Entscheidung von Johannes vom 2026-10-24. `[[Wikilinks]]` sind vom ersten Schalter unberührt (innere Links tragen kein `obsidian:`-Ziel); Entfernte Bilder
 *  (`https:`) bleiben mit und ohne den zweiten Schalter gesperrt, `data:` ebenso.
 *
 *  Verdrahtung im Plugin: die zwei Werte in den Einstellungen halten, `onChange` speichert, und das Chat-Fenster bekommt einen **Getter**, damit ein Umschalten ohne Neuaufbau wirkt:
 *  `domGuard: () => ({ allowObsidianLinks: settings.allowObsidianLinks, allowLocalImages: settings.allowLocalImages })`. Der Schalter wirkt auf die nächste Antwort und auf jede Zeichnung
 *  des Verlaufs (`refresh()`); was schon gezeichnet ist, behält, was der Wächter damals entfernt hat. */
export type LinkSettingKey = "allowObsidianLinks" | "allowLocalImages";

export interface LinkSettingsStrings {
  /** Überschrift der Gruppe. */
  heading: string;
  obsidianLinksName: string;
  obsidianLinksDesc: string;
  localImagesName: string;
  localImagesDesc: string;
}

export interface LinkSettingsStringsOverride extends Partial<LinkSettingsStrings> {
  lang?: "en" | "de";
}

export interface LinkSettingsOptions {
  /** Aktueller Zustand der zwei Schalter; Default im Plugin: beide `false`. */
  allowObsidianLinks: boolean;
  allowLocalImages: boolean;
  /** Ein Schalter wurde umgelegt: Schlüssel und neuer Wert. Der Aufrufer speichert. */
  onChange: (key: LinkSettingKey, value: boolean) => void | Promise<void>;
  strings?: LinkSettingsStringsOverride;
  /** `false` lässt die Überschrift weg (nur `buildLinkSettings`; bei den Definitionen setzt der Aufrufer sie als `heading` der Gruppe). Default `true`. */
  heading?: boolean;
}

export const LINK_SETTINGS_STRINGS_EN: LinkSettingsStrings = {
  heading: "Links and images in answers",
  obsidianLinksName: "Allow obsidian:// links",
  obsidianLinksDesc: "Answers can contain links that trigger Obsidian actions, such as opening another vault. Only turn this on if you trust the answers.",
  localImagesName: "Show local images from the vault",
  localImagesDesc: "Show images from your vault in answers. Remote images always stay blocked.",
};

export const LINK_SETTINGS_STRINGS_DE: LinkSettingsStrings = {
  heading: "Links und Bilder in Antworten",
  obsidianLinksName: "obsidian://-Links erlauben",
  obsidianLinksDesc: "Antworten können Links enthalten, die Obsidian-Aktionen auslösen, etwa einen anderen Vault öffnen. Nur einschalten, wenn du den Antworten vertraust.",
  localImagesName: "Lokale Bilder aus dem Vault anzeigen",
  localImagesDesc: "Bilder aus deinem Vault in Antworten anzeigen. Entfernte Bilder bleiben immer gesperrt.",
};

/** Default der Sprache (EN ohne Angabe), Feld für Feld von `override` überlagert; ein ausdrückliches `undefined` überschreibt nichts. */
export function resolveLinkSettingsStrings(override?: LinkSettingsStringsOverride): LinkSettingsStrings {
  const base = override?.lang === "de" ? LINK_SETTINGS_STRINGS_DE : LINK_SETTINGS_STRINGS_EN;
  if (!override) return base;
  const { lang: _lang, ...fields } = override;
  return { ...base, ...(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) as Partial<LinkSettingsStrings>) };
}

function applyToggle(setting: Setting, name: string, desc: string, value: boolean, key: LinkSettingKey, opts: LinkSettingsOptions): Setting {
  return setting.setName(name).setDesc(desc).addToggle((t) => t.setValue(value).onChange((v) => { void opts.onChange(key, v); }));
}

/** Für Tabs mit `display()`: Überschrift und die zwei Zeilen. Gibt die Zeilen zurück (für Tests und `setDisabled` im Plugin). */
export function buildLinkSettings(containerEl: HTMLElement, opts: LinkSettingsOptions): { obsidianLinks: Setting; localImages: Setting } {
  const s = resolveLinkSettingsStrings(opts.strings);
  if (opts.heading !== false) new Setting(containerEl).setName(s.heading).setHeading();
  return {
    obsidianLinks: applyToggle(new Setting(containerEl), s.obsidianLinksName, s.obsidianLinksDesc, opts.allowObsidianLinks, "allowObsidianLinks", opts),
    localImages: applyToggle(new Setting(containerEl), s.localImagesName, s.localImagesDesc, opts.allowLocalImages, "allowLocalImages", opts),
  };
}

/** Dieselben zwei Zeilen als deklarative Definitionen (Render-Hatch) für Tabs mit `getSettingDefinitions()`; Name und Beschreibung stehen auch an der Definition (Suche). */
export function linkSettingDefinitions(opts: LinkSettingsOptions): SettingDefinitionRender[] {
  const s = resolveLinkSettingsStrings(opts.strings);
  const row = (name: string, desc: string, value: boolean, key: LinkSettingKey): SettingDefinitionRender => ({
    name, desc, render: (setting) => { applyToggle(setting, name, desc, value, key, opts); },
  });
  return [
    row(s.obsidianLinksName, s.obsidianLinksDesc, opts.allowObsidianLinks, "allowObsidianLinks"),
    row(s.localImagesName, s.localImagesDesc, opts.allowLocalImages, "allowLocalImages"),
  ];
}
