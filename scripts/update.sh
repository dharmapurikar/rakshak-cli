#!/usr/bin/env bash
# scripts/update.sh
#
# Bump rakshak tool images to their latest upstream versions, rebuild, push,
# and commit the Makefile changes.
#
# Idempotent: if nothing is outdated, exits 0 with no commit.
#
# Usage:
#   scripts/update.sh                  # check + apply + build + push + commit
#   scripts/update.sh --check          # check only, no changes
#   scripts/update.sh --no-build       # bump Makefile + commit, skip build/push
#   scripts/update.sh --only <tool>    # only update one tool
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$ROOT"

CHECK_ONLY=0
NO_BUILD=0
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)    CHECK_ONLY=1; shift ;;
    --no-build) NO_BUILD=1;   shift ;;
    --only)     ONLY="$2";    shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ---- preflight --------------------------------------------------------------

require() {
  command -v "$1" >/dev/null || { echo "missing dependency: $1" >&2; exit 1; }
}
require jq
require curl
require docker
require git
require make

if [[ $CHECK_ONLY -eq 0 && $NO_BUILD -eq 0 ]]; then
  docker info >/dev/null 2>&1 || { echo "docker daemon not reachable" >&2; exit 1; }
fi

if [[ $CHECK_ONLY -eq 0 ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "working tree not clean; commit or stash first" >&2
    git status --short >&2
    exit 1
  fi
fi

# Load REGISTRY / GITEA_USER / GITEA_TOKEN
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi
: "${REGISTRY:=git.sable-chinstrap.ts.net/rakshak}"

# ---- gather current and latest pins ----------------------------------------

# Read PIN_<tool> from Makefile. Tools with hyphens in their name (osv-scanner,
# eslint-security) are honored — Make allows hyphens in variable names.
current_pin() {
  local tool=$1
  awk -v t="$tool" '
    # Match "PIN_<tool>" followed by any whitespace and ":=".
    $1 == "PIN_" t && $2 == ":=" { print $3; exit }
  ' Makefile
}

echo "tool                current    latest     status"
echo "------------------- ---------- ---------- ------"

# Map of tools to bump: tool -> "old:new"
declare -A BUMPS=()

while IFS=' ' read -r tool latest; do
  [[ -z "$tool" || -z "$latest" ]] && continue
  if [[ -n "$ONLY" && "$tool" != "$ONLY" ]]; then continue; fi
  cur=$(current_pin "$tool")
  if [[ -z "$cur" ]]; then
    printf "%-19s %-10s %-10s NO_PIN\n" "$tool" "?" "$latest"
    continue
  fi
  if [[ "$cur" == "$latest" ]]; then
    printf "%-19s %-10s %-10s OK\n" "$tool" "$cur" "$latest"
  else
    printf "%-19s %-10s %-10s BUMP\n" "$tool" "$cur" "$latest"
    BUMPS[$tool]="$cur:$latest"
  fi
done < <(bash "$SCRIPT_DIR/latest-versions.sh")

# ---- apply ------------------------------------------------------------------

if [[ ${#BUMPS[@]} -eq 0 ]]; then
  echo
  echo "all tools current."
  exit 0
fi

if [[ $CHECK_ONLY -eq 1 ]]; then
  echo
  echo "would bump: ${!BUMPS[@]}"
  exit 0
fi

echo
echo "applying bumps: ${!BUMPS[@]}"

for tool in "${!BUMPS[@]}"; do
  old=${BUMPS[$tool]%:*}
  new=${BUMPS[$tool]#*:}
  # Update the Makefile in place. Preserve original spacing before := .
  if ! grep -q "^PIN_${tool} *:= ${old}\$" Makefile; then
    echo "Makefile pattern not found for $tool ($old); skipping" >&2
    continue
  fi
  awk -v t="$tool" -v n="$new" '
    /^PIN_/ {
      vname = substr($1, 5)
      if (vname == t) {
        # Preserve the original whitespace before ":=" by matching up to it.
        if (match($0, /[^[:space:]]+[[:space:]]+:=/)) {
          print substr($0, 1, RLENGTH) " " n
          next
        }
      }
    }
    { print }
  ' Makefile > Makefile.tmp && mv Makefile.tmp Makefile

  if [[ $NO_BUILD -eq 0 ]]; then
    echo
    echo "=== make build-${tool} push-${tool} ==="
    REGISTRY="$REGISTRY" make "build-${tool}" "push-${tool}"
  else
    echo "skipped build-${tool} (--no-build)"
  fi
done

# ---- commit + push ----------------------------------------------------------

if [[ $NO_BUILD -eq 0 ]]; then
  # Build something readable like "semgrep 1.78.0 -> 1.85.0, trivy 0.52.2 -> 0.53.0"
  bump_list=""
  for tool in "${!BUMPS[@]}"; do
    old=${BUMPS[$tool]%:*}
    new=${BUMPS[$tool]#*:}
    bump_list+="$tool $old -> $new, "
  done
  bump_list=${bump_list%, }

  git add Makefile
  git commit -m "chore(images): bump ${bump_list}"
  git push origin "$(git rev-parse --abbrev-ref HEAD)"
  echo
  echo "committed and pushed."
fi

echo
echo "done. bumped ${#BUMPS[@]} tool(s)."
