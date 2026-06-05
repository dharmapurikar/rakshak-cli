# Updating rakshak

This document covers **how versions are pinned**, **how to update them
manually**, and **three flavors of automation** (a bash script, an opencode
skill, and a Gitea Actions workflow) for keeping the 8 tool images current.

---

## 1. Where versions live

Every tool's upstream version is pinned in exactly one place: the
`PIN.<tool>` lines near the top of the `Makefile`.

```make
PIN.semgrep         := 1.78.0
PIN.jscpd           := 3.5.10
PIN.trivy           := 0.52.2
PIN.gitleaks        := v8.24.3      # upstream tags use 'v' prefix
PIN.osv-scanner     := v1.8.5
PIN.bandit          := 1.7.9
PIN.gosec           := 2.20.0
PIN.eslint-security := 3.0.1
```

Two image tags are produced per tool:
- `${REGISTRY}/<tool>:latest` — what `rakshak <tool>` resolves to at runtime.
- `${REGISTRY}/<tool>:${PIN.<tool>}` — immutable, for pinning in CI.

Updating a tool means: **bump its `PIN.<tool>`, rebuild, push, commit.**

---

## 2. Manual update (single tool)

```bash
# 1. Find the latest upstream tag (example: semgrep)
$ docker hub-tag ls semgrep/semgrep | head   # or browse hub.docker.com
1.85.0

# 2. Edit Makefile: PIN.semgrep := 1.85.0

# 3. Rebuild + push
make build-semgrep push-semgrep

# 4. Verify
docker pull ${REGISTRY}/semgrep:1.85.0 && echo OK

# 5. Commit + push the Makefile bump
git add Makefile
git commit -m "chore(semgrep): bump to 1.85.0"
git push
```

For a bulk bump, repeat per tool or use the automation below.

---

## 3. Automated update — bash script

`scripts/update.sh` is idempotent. For each tool it:

1. Asks the upstream registry for the latest stable semver tag.
2. Compares against the current `PIN.<tool>` in `Makefile`.
3. If different: edits the `Makefile`, runs `make build-<tool> push-<tool>`,
   stages the change in git.
4. At the end: one commit covering all bumps (`chore(images): bump <list>`),
   pushed to `origin/main`.

If nothing is outdated, it exits 0 with no commit.

### Prerequisites

- `bash`, `curl`, `jq`, `docker`, `git`, `make`
- `docker login` already done (or `GITEA_USER` + `GITEA_TOKEN` exported)
- Push rights to `git.sable-chinstrap.ts.net/rakshak/cli`

### Usage

```bash
# Check only — print what would change, exit without modifying anything
./scripts/update.sh --check

# Apply updates, build, push, commit, push to origin
./scripts/update.sh

# Apply but skip docker build/push (only bump Makefile + commit)
./scripts/update.sh --no-build

# Apply only one tool
./scripts/update.sh --only semgrep
```

### Cron example

```cron
# Every Monday 09:00 IST — bump & publish
0 9 * * 1  cd /home/sachin/work/rakshak && ./scripts/update.sh >> /var/log/rakshak-update.log 2>&1
```

---

## 4. Automated update — agentic skill

For agentic runs (any harness that loads a procedure doc — opencode,
Continue, Aider, etc.), see `skills/update-images.md`. The skill wraps
`scripts/update.sh` and adds:

- Pre-flight checks (docker daemon up, Gitea reachable, working tree clean).
- Pretty progress reporting.
- Post-run verification (pull each updated image, smoke-run `rakshak list`).
- Automatic rollback of the commit if any verification fails.

Invoke with whatever your harness supports. For opencode:

```bash
opencode run update-images
```

---

## 5. Automated update — Gitea Actions

`.gitea/workflows/update-images.yml` runs `scripts/update.sh --check` on
push to `main`, and the full update on a weekly schedule (or manual
dispatch from the Gitea UI).

Required Gitea secrets (Settings → Actions → Secrets):

| Secret | Value |
|---|---|
| `GITEA_USER` | your username |
| `GITEA_TOKEN` | personal access token with `package:write` + `repo` scopes |

The workflow uses the built-in `ACTIONS_TOKEN` for git pushes if you
prefer that over a manual PAT.

---

## 6. Per-tool upstream sources

For reference, here's where each tool's "latest" tag is fetched from:

| Tool | Source | API |
|---|---|---|
| semgrep | Docker Hub `semgrep/semgrep` | `https://hub.docker.com/v2/repositories/semgrep/semgrep/tags` |
| jscpd | npm `jscpd` | `https://registry.npmjs.org/jscpd/latest` |
| trivy | Docker Hub `aquasec/trivy` | `https://hub.docker.com/v2/repositories/aquasec/trivy/tags` |
| gitleaks | Docker Hub `zricethezav/gitleaks` | `https://hub.docker.com/v2/repositories/zricethezav/gitleaks/tags` |
| osv-scanner | GHCR `google/osv-scanner` | `https://ghcr.io/v2/google/osv-scanner/tags/list` (anon token) |
| bandit | PyPI `bandit` | `https://pypi.org/pypi/bandit/json` |
| gosec | Docker Hub `securego/gosec` | `https://hub.docker.com/v2/repositories/securego/gosec/tags` |
| eslint-security | npm `eslint-plugin-security` | `https://registry.npmjs.org/eslint-plugin-security/latest` |

`scripts/latest-versions.sh` encapsulates these.

---

## 7. Rollback

If an updated image breaks a scan:

```bash
# 1. Find the previous pin in git history
git log --oneline Makefile

# 2. Revert just that bump
git revert <commit>

# 3. Rebuild + push the older tag (the version-pinned image is still in
#    the Gitea registry; you don't have to wait for the build)
make build-semgrep push-semgrep
```

The `:latest` tag in the registry is mutable, but every `${PIN.<tool>}` tag
is immutable — so pinning consumers to a specific version (e.g.
`rakshak semgrep` with `RAKSHAK_TAG=1.78.0`) survives a botched bump.

---

## 8. Adding a new tool to the update flow

If you add a new tool to `images/<tool>/`:

1. Add it to the `TOOLS` list in `Makefile` and set `PIN.<tool>`.
2. Add a `latest_<tool>()` function to `scripts/latest-versions.sh`.
3. Add a `case` branch to `scripts/update.sh`.
4. (Optional) add it to the matrix in `.gitea/workflows/update-images.yml`.

The agentic skill picks up tools from the Makefile automatically.
