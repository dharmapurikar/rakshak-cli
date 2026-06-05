#!/bin/sh
# jscpd writes JSON to a file under ./report/json/ rather than stdout.
# Run jscpd into a tmpdir, then cat the report to stdout so rakshak's
# "JSON everywhere" contract holds.
set -e

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Forward user args, but force JSON reporter + our tmpdir as the output root.
jscpd "$@" --reporters json --output "$TMPDIR" >/dev/null 2>&1 || true

JSON_FILE="$(find "$TMPDIR" -name 'jscpd-report.json' -type f | head -n 1)"
if [ -n "$JSON_FILE" ]; then
  cat "$JSON_FILE"
else
  echo '{"tool":"jscpd","error":"no report produced"}'
fi
