// uebernommen aus 3d-codeblocks/scripts/lib/vault.ts, 2026-08-16 (make-models-Aufruf optional gemacht)
/**
 * Aufnahme-Vault aus dem getrackten Fixture aufbauen — die pluginneutrale Haelfte.
 *
 * Ein eigener Vault je Plugin loest zwei Probleme in einem Zug: **Kreuzkontamination**
 * (in einem gemeinsamen Vault malen fremde Ribbon-Icons und Sidebars in jedes Bild) und
 * **Determinismus** (Theme und aktive Plugins liegen in der vault-eigenen `.obsidian/`,
 * nicht in der Laune des Augenblicks).
 *
 * Der Vault ist Wegwerfware: sein Inhalt kommt vollstaendig aus `docs/images/fixture/`.
 * Geht er verloren, ist die Aufnahme trotzdem reproduzierbar — das ist der Unterschied
 * zu einem von Hand angelegten Demo-Vault, der beim naechsten Mal weg ist.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface VaultSpec {
  /** Repo-Wurzel, gegen die alle relativen Pfade aufgeloest werden. */
  repoRoot: string;
  /** Zielverzeichnis des Vaults (absolut, aus der Umgebung — nie aus dem Repo). */
  vaultDir: string;
  fixtureDir: string;
  pluginId: string;
  /** Dateien, die das gebaute Plugin ausmachen. */
  pluginFiles?: string[];
}

const DEFAULT_PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];

/**
 * Baut den Vault neu auf und meldet die Schritte.
 *
 * Notizen und Modelle werden ersetzt, `.obsidian/` bekommt die Fixture-Konfiguration.
 * Was NICHT angefasst wird: alles andere unter `.obsidian/` — dort liegt der
 * Fenster-Zustand, und ihn bei jedem Lauf zurueckzusetzen hiesse, Obsidian nach jedem
 * `--setup` neu einrichten zu muessen.
 */
export function buildVault(spec: VaultSpec): string[] {
  const log: string[] = [];
  const { repoRoot, vaultDir, fixtureDir, pluginId } = spec;

  const built = (spec.pluginFiles ?? DEFAULT_PLUGIN_FILES).map((f) => join(repoRoot, f));
  const fehlend = built.filter((f) => !existsSync(f));
  if (fehlend.length) {
    throw new Error(
      `Gebautes Plugin fehlt: ${fehlend.join(", ")}\n` +
      "Erst `npm run build` — der Vault soll den Stand zeigen, den du gerade aenderst.",
    );
  }

  mkdirSync(vaultDir, { recursive: true });

  // Notizen: alte weg, damit eine umbenannte Fixture-Notiz nicht als Leiche bleibt und
  // im Datei-Explorer eines Screenshots auftaucht.
  for (const eintrag of readdirSync(vaultDir)) {
    if (eintrag !== ".obsidian") rmSync(join(vaultDir, eintrag), { recursive: true, force: true });
  }
  cpSync(join(fixtureDir, "notes"), vaultDir, { recursive: true });
  log.push(`Notizen aus ${join("docs/images/fixture", "notes")}`);

  // Optionaler Generator fuer erzeugte Fixture-Inhalte. In der Vorlage
  // (3d-codeblocks) war das ein Pflichtschritt namens `make-models.mjs` — dort werden
  // 3D-Modelle gebaut. Ein Plugin ohne solche Artefakte hat die Datei nicht, und ein
  // Pflichtaufruf macht die "pluginneutrale Haelfte" an genau dieser Stelle unneutral.
  const generator = join(fixtureDir, "make-fixture.mjs");
  if (existsSync(generator)) {
    const erzeugt = execFileSync("node", [generator, vaultDir], { encoding: "utf-8" });
    log.push("Fixture erzeugt:" + erzeugt.replace(/\n$/, "").replace(/\n/g, "\n   "));
  }

  const obsidianDir = join(vaultDir, ".obsidian");
  mkdirSync(obsidianDir, { recursive: true });
  for (const datei of readdirSync(join(fixtureDir, "obsidian"))) {
    cpSync(join(fixtureDir, "obsidian", datei), join(obsidianDir, datei));
  }
  log.push(`Vault-Konfiguration gesetzt (nur ${pluginId} aktiv, helles Theme)`);

  // Layout zuruecksetzen. Obsidian merkt sich Splits und Tab-Gruppen in workspace.json,
  // und ein Aufnahme-Lauf hinterlaesst dort seine Spuren: am 2026-08-15 standen nach
  // mehreren Laeufen sieben Tab-Gruppen nebeneinander, jedes Blatt 174 px breit. Die
  // Bilder entstanden weiterhin fehlerfrei — nur zeigten sie nichts mehr.
  const layout = join(obsidianDir, "workspace.json");
  if (existsSync(layout)) {
    rmSync(layout);
    log.push("Layout zurueckgesetzt (workspace.json entfernt)");
  }

  const pluginDir = join(obsidianDir, "plugins", pluginId);
  mkdirSync(pluginDir, { recursive: true });

  // Plugin-Einstellungen auf den Auslieferungszustand. data.json ueberlebt sonst jeden
  // Lauf: am 2026-08-15 hatte ein frueherer Versuch dort `blockStart: "interactive"`
  // hinterlassen, und damit gab es kein Standbild-Overlay mehr — der einzige Weg, ueber
  // den sich der Controller registriert. Sidebar-Panel, Edit-Modus und Kamerasteuerung
  // fielen aus, und die Ursache stand in einer Datei, die niemand mehr ansah.
  const datenDatei = join(pluginDir, "data.json");
  if (existsSync(datenDatei)) {
    rmSync(datenDatei);
    log.push("Plugin-Einstellungen zurueckgesetzt (data.json entfernt)");
  }
  for (const quelle of built) {
    cpSync(quelle, join(pluginDir, quelle.split("/").pop() as string));
  }
  writeFileSync(join(pluginDir, ".hotreload"), "");
  log.push(`Plugin nach .obsidian/plugins/${pluginId}/ gebaut`);

  return log;
}

/**
 * Vault-Verzeichnis aus der Umgebung.
 *
 * Pflichtvariable, kein Default mit absolutem Pfad: `scripts/check-no-abs-paths.mjs`
 * laeuft in `npm test` und verbietet Pfade ausserhalb des Repos — zu Recht, denn ein
 * fest eingebauter Vault-Ort waere fuer jeden ausser einer Person falsch.
 */
export function stagingVaultDir(repoName: string): string {
  const base = process.env.STAGING_VAULTS_DIR;
  if (!base) {
    throw new Error(
      "STAGING_VAULTS_DIR ist nicht gesetzt.\n" +
      "Sie zeigt auf das Verzeichnis, unter dem die Aufnahme-Vaults liegen — je Plugin " +
      "eines. Beispiel:\n\n  export STAGING_VAULTS_DIR=\"$HOME/StagingVaults\"\n",
    );
  }
  return join(base, repoName);
}
