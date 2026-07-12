// Konfigurierbares Frontmatter: welche Keys erscheinen, unter welchem Namen. Rein und
// testbar. Der Marker `yijing_reading: true` ist NICHT konfigurierbar — die History-Suche
// hängt an ihm; er wird bei aktivem Frontmatter immer gesetzt.

export type FieldId = "date" | "question" | "hexagram" | "changing_lines" | "resulting" | "language" | "register";

export interface FrontmatterField {
  /** Fixe logische Kennung (Wertherkunft). */
  id: FieldId;
  /** Anpassbarer YAML-Key. */
  key: string;
  enabled: boolean;
}

export const MARKER_KEY = "yijing_reading";

export const DEFAULT_FRONTMATTER_FIELDS: FrontmatterField[] = [
  { id: "date", key: "date", enabled: true },
  { id: "question", key: "question", enabled: true },
  { id: "hexagram", key: "hexagram", enabled: true },
  { id: "changing_lines", key: "changing_lines", enabled: true },
  { id: "resulting", key: "resulting", enabled: true },
  { id: "language", key: "language", enabled: true },
  { id: "register", key: "register", enabled: true },
];

export interface FrontmatterValues {
  date: string;
  question: string;
  hexagram: number;
  changingLines: number[];
  resulting: number | null;
  language: string;
  register: string;
}

/** YAML-Wert für ein Feld; null = Feld weglassen (z.B. resulting ohne wandelnde Linien). */
function fieldValue(id: FieldId, v: FrontmatterValues): string | null {
  switch (id) {
    case "date":
      return v.date;
    case "question":
      return JSON.stringify(v.question);
    case "hexagram":
      return String(v.hexagram);
    case "changing_lines":
      return `[${v.changingLines.join(", ")}]`;
    case "resulting":
      return v.resulting === null ? null : String(v.resulting);
    case "language":
      return v.language;
    case "register":
      return v.register;
  }
}

/** Baut den YAML-Innentext (ohne "---"-Zäune) aus den aktiven Feldern + Marker. */
export function buildFrontmatter(fields: FrontmatterField[], values: FrontmatterValues): string {
  const lines: string[] = [`${MARKER_KEY}: true`];
  for (const f of fields) {
    if (!f.enabled) continue;
    const val = fieldValue(f.id, values);
    if (val === null) continue;
    const key = f.key.trim() || f.id;
    lines.push(`${key}: ${val}`);
  }
  return lines.join("\n");
}
