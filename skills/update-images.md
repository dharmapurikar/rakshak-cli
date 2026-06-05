---
name: update-images
description: Bump rakshak container images to their latest upstream versions, rebuild, push to Gitea registry, commit + push the Makefile changes. Idempotent — skips everything if no tools are outdated.
---

# update-images

Bump all 8 rakshak tool images to their latest upstream tags, rebuild them,
push to the Gitea container registry, and commit + push the `Makefile` bumps
to `origin/main`.

This skill is intended to be invoked periodically (e.g. weekly via cron) or
ad-hoc when you want to bring the suite current.

## When to use

- After the user asks to "update rakshak", "bump tool versions", "refresh
  images", or similar.
- Periodically (e.g. a scheduled run).
- After a known upstream security release you want to pull in.

## When NOT to use

- Adding a new tool — that's a code change, not a bump. Use the steps in
  `UPDATING.md` §8.
- Fixing a broken image build — that needs investigation, not a version
  bump.

## Prerequisites

- Working directory is the `rakshak/cli` repo root.
- Working tree is clean (no uncommitted changes).
- `docker daemon` is reachable.
- `.env` exists with `GITEA_USER` and `GITEA_TOKEN` (or both are exported
  in the parent environment).
- The current user has push rights to `git.sable-chinstrap.ts.net/rakshak/cli`.

## Procedure

### Step 1 — Pre-flight checks

Run these in order; abort if any fail.

```bash
git status --porcelain              # must be empty
git remote get-url origin           # must point to rakshak/cli
docker info >/dev/null              # daemon reachable
test -n "${GITEA_TOKEN:-}"          # token exported OR .env contains it
make help >/dev/null                # Makefile parses
```

If any check fails, report which one and stop. Do not attempt to fix
auth/cleanliness issues automatically.

### Step 2 — Dry-run to see what would change

```bash
./scripts/update.sh --check
```

This calls `scripts/latest-versions.sh` to query each upstream registry
(Docker Hub, GHCR, npm, PyPI) and prints a table:

```
tool                current    latest     status
------------------- ---------- ---------- ------
semgrep             1.78.0     1.165.0    BUMP
jscpd               3.5.10     4.2.4      BUMP
...
```

If every line shows `OK`, report "all tools current" and stop.

### Step 3 — Apply the bumps

```bash
./scripts/update.sh
```

This will, for each tool that needs bumping:

1. Edit the `Makefile` (preserving alignment of `:=`).
2. Run `make build-<tool> push-<tool>` (which pushes both `:latest` and
   `:<version>` tags).
3. Stage the `Makefile` change.

At the end it makes a single commit:

```
chore(images): bump semgrep 1.78.0 -> 1.165.0, trivy 0.52.2 -> 0.71.0, ...
```

…and pushes it to `origin/main`.

### Step 4 — Post-run verification

For each tool that bumped, do a smoke test:

```bash
docker pull "${REGISTRY}/<tool>:<new_version>"  # the new tag we just pushed
RAKSHAK_TAG=<new_version> rakshak <tool> --help # exits 0 if entrypoint works
```

For tools that take a subcommand (`trivy fs .`, `gitleaks detect`), use
`--help` only — do not run an actual scan, since that requires a target
project.

If any verification fails:

1. Do NOT push the bump commit if Step 3 hasn't yet (Step 3 already
   pushes — so this is for catching breakage discovered after).
2. Revert the commit:
   ```bash
   git revert HEAD --no-edit
   git push origin main
   ```
3. Rebuild the previous version (the immutable `<old_version>` tag is
   still in the registry):
   ```bash
   git checkout HEAD~1 -- Makefile
   make build-<tool> push-<tool>
   ```
4. Report the failure to the user with the error output and the upstream
   release notes URL (e.g. `https://github.com/semgrep/semgrep/releases`).

### Step 5 — Report

Produce a summary like:

```
Updated 5/8 tools:
  semgrep         1.78.0  -> 1.165.0
  jscpd           3.5.10  -> 4.2.4
  trivy           0.52.2  -> 0.71.0
  gitleaks        v8.24.3 -> v8.30.1
  osv-scanner     v1.8.5  -> v1.9.2

Unchanged: bandit, gosec, eslint-security

Commit: <sha>
Pushed: yes
```

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `missing dependency: jq` | jq not installed | `apt install jq` |
| `docker daemon not reachable` | docker socket issue | `systemctl status docker` |
| `working tree not clean` | uncommitted edits | commit/stash before running |
| `Makefile pattern not found for X` | tool added without PIN_X line | add it manually |
| `4xx` from Docker Hub / GHCR / npm / PyPI | rate limit or auth | wait, or set anonymous mirror |
| `denied: requested access to the resource is denied` on docker push | Gitea token lacks `package:write` scope | regenerate token |
| Build fails with `ARG TOOL_VERSION` warning then empty tag | Dockerfile missing `ARG TOOL_VERSION` before FROM | see commit `5261b6a` for the pattern |

## Related files

- `scripts/latest-versions.sh` — registry lookups
- `scripts/update.sh` — main driver
- `Makefile` — `PIN_<tool>` definitions
- `UPDATING.md` — human-facing docs
- `.gitea/workflows/update-images.yml` — CI version of this skill
