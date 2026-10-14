// Die Wert-Schicht der deklarativen Settings-API: ein Schlüssel je Einstellung, dahinter
// Lesen und Schreiben INKLUSIVE Normalisierung (trim, Default-Rückfall, Zahl-Coercion).
//
// Warum es diese Datei gibt: mit `getSettingDefinitions()` rendert nicht mehr unser Code die
// Zeile, sondern Obsidian — und ruft bei jeder Änderung `setControlValue(key, value)` am Tab.
// Damit hat die Normalisierung keinen Platz mehr im `onChange`-Callback (dort stand sie bis
// 0.4.0) und muss vorher liegen. Der native Host prüft nur den Control-Typ, nicht unsere
// Grenzen: ohne diese Schicht käme aus dem Zahlenfeld der String "abc" bis in die data.json.
//
// Pure — kein obsidian-Import (check:pure).
import { DEFAULT_FILENAME_TEMPLATE } from "../filename";
import { type Register } from "../data";
import { type ThinkingInNote } from "../llm/interpretation";
import { DEFAULT_SETTINGS, type OutputMode, type PluginSettings } from "../settings";

/** Ein Einstellungs-Schlüssel, wie er in `control.key` einer Definition steht. Verschachtelte
 *  Felder tragen ihren Pfad im Namen (`llm.systemPromptDe`) — der Schlüssel ist für Obsidian nur ein
 *  Identifikator, aufgelöst wird er hier. */
export type ControlKey =
  | "readingLang"
  | "register"
  | "defaultOutput"
  | "readingsFolder"
  | "filenameTemplate"
  | "openAfterCreate"
  | "includeFrontmatter"
  | "showNotes"
  | "llm.systemPromptDe"
  | "llm.systemPromptEn"
  | "llm.thinkingInNote"
  | "image.styleSuffix";

export interface ControlSpec {
  get(s: PluginSettings): unknown;
  set(s: PluginSettings, value: unknown): void;
  /** Der Wert entscheidet mit, WELCHE Zeilen der Tab zeigt → nach dem Schreiben neu aufbauen.
   *  (Bedingte Zeilen werden weggelassen statt per `visible` versteckt: der native
   *  1.13-Renderer wertet `visible` an Gruppen-Items nicht aus.) */
  refresh?: boolean;
}

/** Text aus dem, was der Host liefert. Ein Objekt wäre hier ein Programmierfehler (die
 *  Definition nennt einen Control-Typ, der etwas anderes liefert) — es wird zu "" statt
 *  zur Zeichenkette "[object Object]", die sonst bis in die data.json wanderte. */
const asText = (value: unknown): string =>
  typeof value === "string" ? value
  : typeof value === "number" || typeof value === "boolean" ? String(value)
  : "";

/** Text mit Rückfall auf einen Default, wenn nach dem Trimmen nichts bleibt. */
const trimmedOr = (value: unknown, fallback: string): string => asText(value).trim() || fallback;

export const SETTING_CONTROLS: Record<ControlKey, ControlSpec> = {
  readingLang: {
    get: (s) => s.readingLang,
    set: (s, v) => {
      s.readingLang = v as PluginSettings["readingLang"];
    },
  },
  register: {
    get: (s) => s.register,
    set: (s, v) => {
      s.register = v as Register;
    },
  },
  defaultOutput: {
    get: (s) => s.defaultOutput,
    set: (s, v) => {
      s.defaultOutput = v as OutputMode;
    },
  },
  readingsFolder: {
    get: (s) => s.readingsFolder,
    set: (s, v) => {
      s.readingsFolder = trimmedOr(v, DEFAULT_SETTINGS.readingsFolder);
    },
  },
  filenameTemplate: {
    get: (s) => s.filenameTemplate,
    set: (s, v) => {
      s.filenameTemplate = trimmedOr(v, DEFAULT_FILENAME_TEMPLATE);
    },
  },
  openAfterCreate: {
    get: (s) => s.openAfterCreate,
    set: (s, v) => {
      s.openAfterCreate = Boolean(v);
    },
  },
  includeFrontmatter: {
    get: (s) => s.includeFrontmatter,
    set: (s, v) => {
      s.includeFrontmatter = Boolean(v);
    },
    refresh: true, // blendet die Feld-Zeilen ein/aus
  },
  showNotes: {
    get: (s) => s.showNotes,
    set: (s, v) => {
      s.showNotes = Boolean(v);
    },
  },

  "llm.systemPromptDe": {
    get: (s) => s.llm.systemPromptDe,
    set: (s, v) => {
      s.llm.systemPromptDe = asText(v); // leer = Default-Prompt, also NICHT trimmen-mit-Rückfall
    },
  },
  "llm.systemPromptEn": {
    get: (s) => s.llm.systemPromptEn,
    set: (s, v) => {
      s.llm.systemPromptEn = asText(v);
    },
  },
  "llm.thinkingInNote": {
    get: (s) => s.llm.thinkingInNote,
    set: (s, v) => {
      s.llm.thinkingInNote = v as ThinkingInNote;
    },
  },

  "image.styleSuffix": {
    get: (s) => s.image.styleSuffix,
    set: (s, v) => {
      s.image.styleSuffix = asText(v);
    },
  },
};

function specFor(key: string): ControlSpec {
  const spec = SETTING_CONTROLS[key as ControlKey];
  // Ein unbekannter Schlüssel ist ein Programmierfehler (eine Definition nennt einen Key, den
  // die Registry nicht kennt) — und wäre sonst die stillste aller Fehlerarten: die Zeile
  // erscheint, nimmt Eingaben an und wirft sie weg.
  if (!spec) throw new Error(`Unbekannter Settings-Schlüssel: ${key}`);
  return spec;
}

export function readControl(settings: PluginSettings, key: string): unknown {
  return specFor(key).get(settings);
}

/** Schreibt den Wert normalisiert und meldet, ob der Tab danach neu aufgebaut werden muss. */
export function writeControl(settings: PluginSettings, key: string, value: unknown): boolean {
  const spec = specFor(key);
  spec.set(settings, value);
  return spec.refresh === true;
}
