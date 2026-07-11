/** Shallow-Merge gespeicherter Plugin-Settings über Defaults. VENDORED aus
 *  obsidian-kit/src/pure/settings.ts. Default-*Werte* werden eine Ebene tief geklont
 *  (Arrays slice(), Plain-Objects Spread), damit das Ergebnis nie Referenzen mit dem
 *  Defaults-Objekt teilt. Unbekannte raw-Felder bleiben erhalten (Forward-Compat).
 *  null/non-object raw → Default-Kopie. */
export function mergeSettings<T extends object>(defaults: T, raw: unknown): T {
  const base: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(defaults)) {
    base[key] = Array.isArray(value)
      ? value.slice()
      : value !== null && typeof value === "object"
        ? { ...value }
        : value;
  }
  if (raw !== null && typeof raw === "object") Object.assign(base, raw);
  return base as T;
}
