// Lokale Zeitmarke bis auf die Minute (ISO-nah, ohne Sekunden). Lebt in der
// obsidian-Schicht, weil sie Date() nutzt — der pure Kern bleibt uhr-frei.
export function nowStamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
