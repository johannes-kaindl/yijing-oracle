#!/bin/sh
# uebernommen aus lingotuner/tools/sync-kit.sh, 2026-09-15 (Welle 2, Auftrag 3)
# Re-vendor kit modules from ../obsidian-kit (+ ../../libs/code-kit). Run after kit updates.
set -e

KIT="${KIT_DIR:-../obsidian-kit}"
# Seit obsidian-kit 2ab1bb5 ("domaenenfreie pure-Teilmenge zieht nach code-kit") liegen die
# meisten hier vendorten pure-Module dort, nicht mehr unter obsidian-kit/src/pure/.
CODE_KIT="${CODE_KIT_DIR:-../../libs/code-kit}"
[ -d "$KIT/src/pure" ] || { echo "Kit nicht gefunden unter $KIT (KIT_DIR setzen)" >&2; exit 1; }
[ -d "$CODE_KIT/src/ts" ] || { echo "code-kit nicht gefunden unter $CODE_KIT (CODE_KIT_DIR setzen)" >&2; exit 1; }
# CORE-META-22: gelesen wird aus einer FESTEN REF, nicht aus dem Arbeitsstand des
# Nachbar-Repos. Ein `cp` aus dessen Worktree koppelt dieses Repo an einen fremden HEAD.
VER="${KIT_REF:?KIT_REF setzen, z.B. KIT_REF=0.35.0}"
CODE_VER="${CODE_KIT_REF:?CODE_KIT_REF setzen, z.B. CODE_KIT_REF=0.6.0}"
for paar in "$KIT|$VER" "$CODE_KIT|$CODE_VER"; do
  repo=${paar%%|*}; ref=${paar##*|}
  git -C "$repo" rev-parse --verify --quiet "$ref^{commit}" >/dev/null || {
    echo "FEHLER: Ref '$ref' existiert nicht in $repo." >&2
    exit 2
  }
done
SHA=$(git -C "$KIT" rev-parse --short "$VER^{commit}")

# Ein pures Modul kann in drei Schichten liegen. Statt fester Zuordnung wird gesucht.
# Ausgabe: <repo>|<ref>|<quelle>|<quell-relativer-pfad>|<version>
quelle_fuer() {
  for kandidat in \
    "$KIT|$VER|obsidian-kit|src/pure/$1.ts|$VER" \
    "$CODE_KIT|$CODE_VER|code-kit|src/ts/pure/$1.ts|$CODE_VER" \
    "$CODE_KIT|$CODE_VER|code-kit|src/ts/web/$1.ts|$CODE_VER"; do
    repo=$(printf '%s' "$kandidat" | cut -d'|' -f1)
    ref=$(printf '%s' "$kandidat" | cut -d'|' -f2)
    rel=$(printf '%s' "$kandidat" | cut -d'|' -f4)
    if git -C "$repo" cat-file -e "$ref:$rel" 2>/dev/null; then
      printf '%s\n' "$kandidat"; return 0
    fi
  done
  return 1
}

hole() { # hole <repo> <ref> <quell-pfad> <ziel>
  git -C "$1" show "$2:$3" > "$4.tmp" || { rm -f "$4.tmp"; return 1; }
  mv "$4.tmp" "$4"
}

stamp() { # stamp <vendored-file> <quell-relativer-pfad> [<quelle> <version>]
  quelle=${3:-obsidian-kit}
  version=${4:-$VER}
  header="// vendored from $quelle@$version, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

# Kit-interne Querimporte aufs Vendor-Layout umschreiben (Praezedenz: lingotuner/tools/sync-kit.sh,
# llm-endpoint-manager/tools/sync-kit.sh). Im Kit liegen die Schichten als src/obsidian + src/pure
# nebeneinander, hier als src/vendor/kit-obsidian + src/vendor/kit — `../pure/` bzw.
# `../vendor/code-kit/{pure,web}/` zeigen hier also ins Leere. Das ist die EINZIGE zulaessige
# Abweichung von verbatim; bei jedem Re-Vendor reproduzieren, sonst darf nichts abweichen.
relayer() { # relayer <vendored-file>
  f=$1
  case "$f" in
    src/vendor/kit-obsidian/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit-obsidian/ — der Querimport-Umschrieb setzt die Zwei-Ordner-Form voraus" >&2; exit 1 ;;
  esac
  [ -d src/vendor/kit ] || { echo "sync-kit: src/vendor/kit/ fehlt — pure-Schicht anlegen, bevor gekoppelte Module mit Querimport vendoriert werden" >&2; exit 1; }

  sed -e 's|\(["'"'"']\)\.\./pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1../kit/|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  if grep -qE '\.\./(pure|vendor/code-kit)/' "$f"; then
    echo "sync-kit: unaufgeloester Kit-Querimport in $f — Muster pruefen" >&2; exit 1
  fi
  for dep in $(sed -n 's|.*from ["'"'"']\.\./kit/\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ../kit/$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal imports (../pure/ and ../vendor/code-kit/{pure,web}/) → ../kit/ (vendor layout); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

# Fallgruppe: ein PURE_MODULE aus obsidian-kit/src/pure/, das selbst einen Querimport auf
# code-kit traegt. Hier landen BEIDE Seiten flach nebeneinander in src/vendor/kit/, der
# Zielpfad ist also `./` statt `../kit/`. Anlass: endpoint-source.ts importiert endpoint_config
# aus ../vendor/code-kit/pure/ (obsidian-kit-Perspektive).
relayer_pure() { # relayer_pure <vendored-file>
  f=$1
  case "$f" in
    src/vendor/kit/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit/ — relayer_pure gilt nur fuer die pure-Schicht" >&2; exit 1 ;;
  esac
  sed -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1./|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1./|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi
  mv "$f.tmp" "$f"
  if grep -qE '\.\./vendor/code-kit/' "$f"; then
    echo "sync-kit: unaufgeloester Kit-Querimport in $f — Muster pruefen" >&2; exit 1
  fi
  for dep in $(sed -n 's|.*from ["'"'"']\./\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ./$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done
  note="// ONE mechanical deviation from verbatim: kit-internal import (../vendor/code-kit/{pure,web}/) → ./ (flat vendor layout, sibling module in src/vendor/kit/); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

# ZWEITE, GROESSERE Abweichung, NUR fuer kit-obsidian/secrets.ts: dieses Repo hat minAppVersion
# 1.8.7, `app.secretStorage` existiert erst seit 1.11.4. Das Kit-Original nimmt die API direkt
# (`SecretStore`, nie null) — der Store-Scanner (`no-unsupported-api`) rechnet den Obsidian-Typ
# `SecretStorage` gegen die minAppVersion und wuerde das anstreichen. Vorlage: die bisherige
# Handfassung dieses Repos (uebernommen aus calendar-notes, s. Git-History vor diesem Vendoring).
# Ersetzt einen direkten Access durch einen Laufzeit-Feature-Check (`?? null`, struktureller
# KeychainLike-Cast statt des Obsidian-Typs) und macht `obsidianSecretStore` nullable. Guards mit
# `grep` VOR jeder Ersetzung: aendert sich das Kit-Original strukturell, bricht dieser Schritt laut
# statt still ein falsches Ergebnis zu erzeugen.
adapt_secrets_floor() {
  f="src/vendor/kit-obsidian/secrets.ts"
  grep -q 'export function obsidianSecretStore(app: App): SecretStore {' "$f" || {
    echo "sync-kit: obsidianSecretStore-Signatur in $f weicht vom erwarteten Kit-Original ab — adapt_secrets_floor manuell nachziehen" >&2
    exit 1
  }
  grep -q 'app.secretStorage.getSecret(id)' "$f" || {
    echo "sync-kit: erwartete app.secretStorage-Zugriffe in $f nicht gefunden — adapt_secrets_floor manuell nachziehen" >&2
    exit 1
  }
  python3 - "$f" <<'PY'
import sys, re
path = sys.argv[1]
src = open(path, encoding="utf-8").read()

marker_import = 'import { stripCrLf, type SecretStore } from "../kit/secrets";\n'
assert marker_import in src, "import-Zeile nicht gefunden"
keychain = (
    marker_import
    + "\n"
    + "/** Strukturelle Sicht auf `app.secretStorage`, bewusst NICHT der Obsidian-Typ: der\n"
    + " *  Store-Scanner (`no-unsupported-api`) rechnet den Typ `SecretStorage` gegen minAppVersion\n"
    + " *  1.8.7 — den Laufzeit-Feature-Check darunter sieht er nicht. Gemessen an obsidian.d.ts\n"
    + " *  1.13.1. Eingefuegt durch tools/sync-kit.sh::adapt_secrets_floor, nicht Teil des\n"
    + " *  Kit-Originals. */\n"
    + "interface KeychainLike {\n"
    + "  getSecret(id: string): string | null;\n"
    + "  setSecret(id: string, secret: string): void;\n"
    + "}\n"
)
src = src.replace(marker_import, keychain, 1)

old_sig = "export function obsidianSecretStore(app: App): SecretStore {\n  return {\n"
new_sig = (
    "export function obsidianSecretStore(app: App): SecretStore | null {\n"
    "  // Cast statt Direktzugriff: `no-unsupported-api` misst gegen minAppVersion 1.8.7.\n"
    "  const storage = (app as { secretStorage?: KeychainLike }).secretStorage ?? null;\n"
    "  if (!storage) return null;\n"
    "  return {\n"
)
assert old_sig in src, "obsidianSecretStore-Signatur nicht gefunden"
src = src.replace(old_sig, new_sig, 1)

src = src.replace("app.secretStorage.getSecret(id)", "storage.getSecret(id)")
src = src.replace('app.secretStorage.setSecret(id, sanitized)', 'storage.setSecret(id, sanitized)')
src = src.replace('app.secretStorage.setSecret(id, "")', 'storage.setSecret(id, "")')

assert "app.secretStorage." not in src, "ein app.secretStorage-Zugriff blieb stehen"

open(path, "w", encoding="utf-8").write(src)
PY
}

mkdir -p src/vendor/kit src/vendor/kit-obsidian

# Pure Module (kein obsidian-Import), Dateiname = Kit-Quellname. think.ts heisst im Kit
# think-splitter.ts — dieses Repo behaelt seinen eigenen Dateinamen (siehe Umbenennung unten),
# damit die bestehenden Importe (src/obsidian/sse.ts, tests/think.test.ts) unangetastet bleiben.
# secrets/endpoint_config/model-choice/endpoint-source seit 2026-09-16 (LLM-Endpoint-Manager-
# Migration, Plan 3): secrets fuer den lokalen Schluesselbund-Fallback, der Rest fuer
# resolveEndpointSource() (Manager-first, lokale Liste als Fallback).
PURE_MODULE="callout filename-template reasoning settings endpoint sse think-splitter model-context i18n endpoint_diagnostics secrets endpoint_config model-choice endpoint-source"
# Gekoppelte Schicht (importiert `obsidian`). endpoint-list.ts und stable-writer.ts sind hier
# BEWUSST NICHT gelistet: endpoint-list.ts ist ein Bruch (siehe AGENTS.md § UI-Abweichungen),
# stable-writer.ts gilt nur fuer Push-Bauart mit Markdown-Anspruch (dieses Repo ist Bauart 4).
OBSIDIAN_MODULE="folder-suggest settings_walker stream-area secrets model-picker endpoint-source"

liste() { for m in $1; do printf '%s.ts, ' "$m"; done | sed 's/, $//'; }

for m in $PURE_MODULE; do
  quelle_fuer "$m" >/dev/null || {
    echo "FEHLER: $m.ts liegt weder in $KIT/src/pure/ noch in $CODE_KIT/src/ts/{pure,web}/." >&2
    exit 2
  }
done

for m in $PURE_MODULE; do
  fund=$(quelle_fuer "$m")
  repo=$(printf '%s' "$fund" | cut -d'|' -f1)
  ref=$(printf '%s' "$fund" | cut -d'|' -f2)
  quelle=$(printf '%s' "$fund" | cut -d'|' -f3)
  rel=$(printf '%s' "$fund" | cut -d'|' -f4)
  ver=$(printf '%s' "$fund" | cut -d'|' -f5)
  # think-splitter → think.ts (Umbenennung, s.o.), sonst identisch.
  ziel="$m"; [ "$m" = "think-splitter" ] && ziel="think"
  hole "$repo" "$ref" "$rel" "src/vendor/kit/$ziel.ts" || {
    echo "FEHLER: $ref:$rel nicht lesbar in $repo" >&2; exit 2; }
  # endpoint-source.ts (obsidian-kit/src/pure/) traegt einen Querimport auf code-kit, dessen
  # obsidian-kit-eigene Vendor-Kopie hier nicht existiert — auf die flache Ablage umschreiben.
  case "$m" in endpoint-source) relayer_pure "src/vendor/kit/$m.ts" ;; esac
  stamp "src/vendor/kit/$ziel.ts" "$rel" "$quelle" "$ver"
  echo "vendored $quelle@$ver/$rel -> src/vendor/kit/$ziel.ts"
done

for m in $OBSIDIAN_MODULE; do
  hole "$KIT" "$VER" "src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts" || {
    echo "FEHLER: $VER:src/obsidian/$m.ts nicht lesbar" >&2; exit 2; }
  # secrets.ts, model-picker.ts und endpoint-source.ts tragen Querimporte auf ../pure/ bzw.
  # ../vendor/code-kit/{pure,web}/. Ein pauschaler Aufruf waere wirkungslos, aber irrefuehrend.
  case "$m" in secrets|model-picker|endpoint-source) relayer "src/vendor/kit-obsidian/$m.ts" ;; esac
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done

# 1.8.7-Floor-Anpassung fuer secrets.ts — NACH stamp, damit der Kopfstempel die Kit-Herkunft
# nennt und die Anpassung selbst als zweite, benannte Abweichung obendrauf sichtbar bleibt.
adapt_secrets_floor

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "code_kit_version": "$CODE_VER",
  "vendored": "$(liste "$PURE_MODULE")",
  "note": "Verbatim snapshot aus ZWEI Quellen (obsidian-kit + code-kit); welche Datei woher stammt, sagt ihr eigener Kopf. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. think-splitter.ts liegt hier unter dem Dateinamen think.ts (Kopfstempel nennt die Kit-Quelle). Konsolidiert 2026-09-15 (Welle 2) von vier nebeneinander gefuehrten Pins (0.16.0/0.26.1/0.27.0/0.29.0) auf einen."
}
JSON
cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "$(liste "$OBSIDIAN_MODULE")",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. Eigene Ablage neben src/vendor/kit/, weil diese Module \"obsidian\" importieren. endpoint-list.ts wird bewusst NICHT vendoriert (Bruch, siehe AGENTS.md § UI-Abweichungen)."
}
JSON
echo "VENDOR.json -> $VER ($SHA)"
