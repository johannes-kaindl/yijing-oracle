// Gemeinsamer Kontext aller Settings-Sektionen: der schmale Host-Vertrag plus ein
// Rerender-Callback. Eigene Datei, damit die Sektionen sich nicht gegenseitig importieren
// müssen (index.ts importiert alle, nicht umgekehrt).
import { type SettingsHost } from "../../core/settings";

export interface SectionCtx {
  host: SettingsHost;
  /** Vollständiger Neuaufbau des Tabs (bisher: this.display()). */
  rerender: () => void;
}
