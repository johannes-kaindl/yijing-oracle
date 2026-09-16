// vendored from obsidian-kit@0.37.1, src/obsidian/secrets.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
// ONE mechanical deviation from verbatim: kit-internal imports (../pure/ and ../vendor/code-kit/{pure,web}/) → ../kit/ (vendor layout); reproduce on every re-vendor, nothing else may differ.
import type { App } from "obsidian";
import { stripCrLf, type SecretStore } from "../kit/secrets";

/** Strukturelle Sicht auf `app.secretStorage`, bewusst NICHT der Obsidian-Typ: der
 *  Store-Scanner (`no-unsupported-api`) rechnet den Typ `SecretStorage` gegen minAppVersion
 *  1.8.7 — den Laufzeit-Feature-Check darunter sieht er nicht. Gemessen an obsidian.d.ts
 *  1.13.1. Eingefuegt durch tools/sync-kit.sh::adapt_secrets_floor, nicht Teil des
 *  Kit-Originals. */
interface KeychainLike {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
}

/** Form-Prüfung statt Versionsprüfung (Muster anysource-sideloader `src/main.ts`): ob der
 *  Schlüsselbund da ist, sagt die API selbst — eine Versionsnummer sagt nur, ab wann er
 *  da sein sollte. */
export function secretStorageAvailable(app: App): boolean {
  const s = (app as { secretStorage?: unknown }).secretStorage as
    | { getSecret?: unknown; setSecret?: unknown }
    | undefined;
  return typeof s?.getSecret === "function" && typeof s?.setSecret === "function";
}

/** SecretStore über `app.secretStorage` (Obsidian-Schlüsselbund, seit 1.11.4).
 *  `set` liest nach dem Schreiben zurück (TaskNotes-Kniff) — ein `setSecret`, das den Wert
 *  stillschweigend verwirft (Plattform ohne Keychain-Zugriff), soll hier auffallen statt erst
 *  beim nächsten Aufruf mit einem falschen Token. `delete` schreibt den Leerstring: die
 *  Obsidian-API hat keinen Löschaufruf, und `has` behandelt leer als „nicht vorhanden". */
export function obsidianSecretStore(app: App): SecretStore | null {
  // Cast statt Direktzugriff: `no-unsupported-api` misst gegen minAppVersion 1.8.7.
  const storage = (app as { secretStorage?: KeychainLike }).secretStorage ?? null;
  if (!storage) return null;
  return {
    get(id: string): string | null {
      const v = storage.getSecret(id);
      return v === "" ? null : v;
    },
    set(id: string, value: string): void {
      const sanitized = stripCrLf(value);
      storage.setSecret(id, sanitized);
      if (storage.getSecret(id) !== sanitized) {
        throw new Error(`Obsidian SecretStorage did not persist ${id}`);
      }
    },
    has(id: string): boolean {
      const v = storage.getSecret(id);
      return v !== null && v !== "";
    },
    delete(id: string): void {
      storage.setSecret(id, "");
    },
  };
}
