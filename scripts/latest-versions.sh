#!/usr/bin/env bash
# scripts/latest-versions.sh
#
# Print the latest stable upstream version for each rakshak tool.
# Output format: <tool> <version>   (one per line)
#
# Pure read-only network calls. Safe to run from cron / CI.
set -euo pipefail

# ---- helpers ----------------------------------------------------------------

# Latest stable semver tag from Docker Hub, with 'v' prefix preserved if
# upstream uses one. Excludes pre-releases and non-semver tags.
dh_latest() {
  local repo=$1
  curl -sf "https://hub.docker.com/v2/repositories/${repo}/tags/?page_size=30" \
    | jq -r '.results[].name' \
    | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V -r \
    | head -1
}

npm_latest() {
  curl -sf "https://registry.npmjs.org/${1}/latest" | jq -r .version
}

pypi_latest() {
  curl -sf "https://pypi.org/pypi/${1}/json" | jq -r .info.version
}

ghcr_latest() {
  local repo=$1 token
  token=$(curl -sf "https://ghcr.io/token?scope=repository:${repo}:pull&service=ghcr.io" | jq -r .token)
  curl -sfH "Authorization: Bearer ${token}" "https://ghcr.io/v2/${repo}/tags/list" \
    | jq -r '.tags[]?' \
    | grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+$' \
    | grep -v -- '-(amd64|arm64)$' \
    | sort -V -r \
    | head -1
}

# ---- per-tool lookups -------------------------------------------------------

latest_semgrep()         { dh_latest   "semgrep/semgrep"; }
latest_jscpd()           { npm_latest  "jscpd"; }
latest_trivy()           { dh_latest   "aquasec/trivy"; }
latest_gitleaks()        { dh_latest   "zricethezav/gitleaks"; }
latest_osv-scanner()     { ghcr_latest "google/osv-scanner"; }
latest_bandit()          { pypi_latest "bandit"; }
latest_gosec()           { dh_latest   "securego/gosec"; }
latest_eslint-security() { npm_latest  "eslint-plugin-security"; }

# ---- main -------------------------------------------------------------------

TOOLS=(semgrep jscpd trivy gitleaks osv-scanner bandit gosec eslint-security)

if [[ $# -gt 0 ]]; then
  # Single tool lookup
  for tool in "$@"; do
    fn="latest_${tool}"
    if declare -f "$fn" >/dev/null; then
      echo "$tool $($fn)"
    else
      echo "$tool ERROR:no_lookup_function" >&2
      exit 2
    fi
  done
else
  for tool in "${TOOLS[@]}"; do
    fn="latest_${tool}"
    if declare -f "$fn" >/dev/null; then
      echo "$tool $($fn)"
    fi
  done
fi
