// Lokale Zeitmarke bis auf die Minute (ISO-nah, ohne Sekunden). Lebt in der
// obsidian-Schicht, weil sie die Uhr liest — der pure Kern bleibt uhr-frei.
import { localIso } from "../vendor/kit/local-stamp";

export function nowStamp(): string {
  return localIso(new Date(), { seconds: false });
}
