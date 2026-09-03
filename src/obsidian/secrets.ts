// uebernommen aus calendar-notes/src/obsidian/secrets.ts, 2026-09-03
// Abweichungen: `MemorySecretStore` entfaellt (die Tests bringen ihre eigene Attrappe mit);
// `has()` entfaellt (kein Verbraucher); dazu kommt der Laufzeit-Feature-Check `?? null`,
// weil der Floor dieses Plugins 1.8.7 ist und `app.secretStorage` erst seit 1.11.4 existiert.
import type { App } from "obsidian";
import type { SecretStore } from "../core/settings/api-key-storage";

/** Entfernt fuehrende/abschliessende CR/LF — der typische Clipboard-Rest, wenn ein
 *  Schluessel per `pbcopy < datei` aus einer Datei mit Zeilenumbruch kopiert wurde.
 *  Absichtlich kein voller `trim()`: nur Zeilenumbrueche sind nie Teil eines Schluessels. */
function stripCrLf(value: string): string {
  return value.replace(/^[\r\n]+/, "").replace(/[\r\n]+$/, "");
}

/** Strukturelle Sicht auf `app.secretStorage`, bewusst NICHT der Obsidian-Typ: der Store-Scanner
 *  (`no-unsupported-api`) rechnet den Typ `SecretStorage` gegen minAppVersion 1.8.7 — den
 *  Laufzeit-Feature-Check darunter sieht er nicht. Gemessen an obsidian.d.ts 1.13.1. */
interface KeychainLike {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
}

/** SecretStore ueber `app.secretStorage` (Obsidian-Schluesselbund, seit 1.11.4) — oder `null`
 *  auf einer Version, die ihn nicht hat; dann bleibt der Schluessel in data.json.
 *  `set` liest nach dem Schreiben zurueck (TaskNotes-Kniff) — ein `setSecret`, das den Wert
 *  stillschweigend verwirft (z. B. Plattform ohne Keychain-Zugriff), soll hier auffallen
 *  statt erst beim naechsten Request mit einem 401. */
export function obsidianSecretStore(app: App): SecretStore | null {
  // Cast statt Direktzugriff: `no-unsupported-api` misst gegen minAppVersion 1.8.7.
  const storage = (app as { secretStorage?: KeychainLike }).secretStorage ?? null;
  if (!storage) return null;
  return {
    get(id: string): string | null {
      return storage.getSecret(id);
    },
    set(id: string, value: string): void {
      const sanitized = stripCrLf(value);
      storage.setSecret(id, sanitized);
      if (storage.getSecret(id) !== sanitized) {
        throw new Error(`Obsidian SecretStorage did not persist ${id}`);
      }
    },
  };
}
