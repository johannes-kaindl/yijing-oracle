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

mkdir -p src/vendor/kit src/vendor/kit-obsidian

# Pure Module (kein obsidian-Import), Dateiname = Kit-Quellname. think.ts heisst im Kit
# think-splitter.ts — dieses Repo behaelt seinen eigenen Dateinamen (siehe Umbenennung unten),
# damit die bestehenden Importe (src/obsidian/sse.ts, tests/think.test.ts) unangetastet bleiben.
PURE_MODULE="callout filename-template reasoning settings endpoint sse think-splitter model-context i18n endpoint_diagnostics"
# Gekoppelte Schicht (importiert `obsidian`). endpoint-list.ts und stable-writer.ts sind hier
# BEWUSST NICHT gelistet: endpoint-list.ts ist ein Bruch (siehe AGENTS.md § UI-Abweichungen),
# stable-writer.ts gilt nur fuer Push-Bauart mit Markdown-Anspruch (dieses Repo ist Bauart 4).
OBSIDIAN_MODULE="folder-suggest settings_walker stream-area"

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
  stamp "src/vendor/kit/$ziel.ts" "$rel" "$quelle" "$ver"
  echo "vendored $quelle@$ver/$rel -> src/vendor/kit/$ziel.ts"
done

for m in $OBSIDIAN_MODULE; do
  hole "$KIT" "$VER" "src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts" || {
    echo "FEHLER: $VER:src/obsidian/$m.ts nicht lesbar" >&2; exit 2; }
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done

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
