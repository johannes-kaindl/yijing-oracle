// Gemeinsamer Kontext aller Settings-Sektionen: der schmale Host-Vertrag plus die drei Wege,
// auf denen eine Zeile etwas bewirkt. Eigene Datei, damit die Sektionen sich nicht gegenseitig
// importieren müssen (index.ts importiert alle, nicht umgekehrt).
import { type SettingGroupItem } from "obsidian";
import { type ControlKey } from "../../core/settings/controls";
import { type SettingsHost } from "../../core/settings";

/** Eine Zeile in einer Sektion. Der Generic bindet jeden `control.key` an einen Schlüssel,
 *  den die Registry kennt — ein Tippfehler bricht den Build, statt zur Laufzeit eine Zeile
 *  zu zeigen, die Eingaben annimmt und wegwirft. */
export type SettingRow = SettingGroupItem<ControlKey>;

export interface SectionCtx {
  host: SettingsHost;
  /** Wert normalisiert schreiben, speichern und — wenn der Schlüssel die Zeilen-Auswahl
   *  ändert — den Tab neu aufbauen. Der Weg für alles, was die Registry kennt. */
  write(key: ControlKey, value: unknown): void;
  /** Nur speichern. Für Hatches, die verschachtelte Listen an Ort und Stelle mutieren
   *  (Frontmatter-Felder, Callouts, Endpunkt-Liste) und keinen Registry-Schlüssel haben. */
  save(): void;
  /** Vollständiger Neuaufbau des Tabs. */
  rerender: () => void;
}
