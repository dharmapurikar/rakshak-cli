# rakshak

Containerized security & code-quality scanners you can summon from any
project. Each tool is a pinned Docker image in your self-hosted Gitea
container registry; a thin npm CLI (`@rakshak/cli`) dispatches to the right
container so running a scan from anywhere is a one-liner.

Designed for single-user / private-network deployments (e.g. over Tailscale)
where you control both the scanner versions and the projects being scanned.

```
$ cd my-project
$ rakshak doctor        # verify docker + registry + auth + image cache
$ rakshak semgrep       # runs semgrep in a container, JSON to stdout
$ rakshak trivy fs .
$ rakshak all           # runs every enabled tool in sequence
$ rakshak list          # show configured tools and image refs
```

---

## Quick start (first time on a new machine)

The package and images live on a private Gitea server
(`git.sable-chinstrap.ts.net`). Once you're on the Tailscale network:

```bash
# 1. Install the CLI. The Gitea npm registry must be configured first —
#    rakshak init will do that for you.
npm install -g @rakshak/cli

# 2. Configure access (writes ~/.npmrc + does docker login).
rakshak init
#    → prompts for your Gitea personal access token
#    → token needs scopes: package:read, package:write, repo

# 3. Sanity check.
rakshak doctor
#    ✓ docker daemon
#    ✓ Tailscale network
#    ✓ Gitea registry reachable
#    ✓ npm registry
#    ✓ docker registry auth
#    8/8 images cached locally
#    Status: ready.
```

If `rakshak init` fails because the package isn't installed yet, install
with explicit registry:

```bash
npm install -g @rakshak/cli \
  --registry=https://git.sable-chinstrap.ts.net/api/packages/rakshak/npm/
```

---

## Tools

| Tool | Image | Purpose |
|---|---|---|
| semgrep | `${REGISTRY}/semgrep` | SAST, 35+ languages, OWASP rulesets |
| jscpd | `${REGISTRY}/jscpd` | Copy-paste / duplicate code detection |
| trivy | `${REGISTRY}/trivy` | SCA, secrets, IaC, container scans |
| gitleaks | `${REGISTRY}/gitleaks` | Secrets in working tree + git history |
| osv-scanner | `${REGISTRY}/osv-scanner` | Dependency vulns (OSV database) |
| bandit | `${REGISTRY}/bandit` | Python security linter |
| gosec | `${REGISTRY}/gosec` | Go security linter |
| eslint-security | `${REGISTRY}/eslint-security` | JS/TS security linter |

All output is **JSON to stdout** (stderr carries the tool's human-readable
banner / progress). Exit codes pass through so CI fails on findings by
default.

---

## Example output

`rakshak gitleaks` on a project with a committed token:

```json
[
  {
    "RuleID": "generic-api-key",
    "Description": "Detected a Generic API Key...",
    "StartLine": 2,
    "EndLine": 2,
    "Match": "_authToken=0b74eab7f738d03e9f4ea3bbc2eb0850a2f48a4f",
    "File": ".npmrc",
    "Commit": "49972798322c8b82d9b6189b3ee3c7c91e30d298",
    "Author": "t",
    "Date": "2026-06-05T15:25:02Z",
    "Fingerprint": "49972798322c8b82d9b6189b3ee3c7c91e30d298:.npmrc:generic-api-key:2"
  }
]
```

`rakshak trivy fs .` (excerpt):

```json
{
  "SchemaVersion": 2,
  "Results": [
    {
      "Target": "package-lock.json",
      "Class": "lang-pkgs",
      "Type": "npm",
      "Vulnerabilities": [
        {
          "VulnerabilityID": "CVE-2024-12345",
          "PkgName": "lodash",
          "InstalledVersion": "4.17.20",
          "FixedVersion": "4.17.21",
          "Severity": "HIGH",
          "Title": "lodash: prototype pollution"
        }
      ]
    }
  ]
}
```

`rakshak bandit -r .` (excerpt):

```json
{
  "errors": [],
  "generated_at": "2026-06-05T15:30:00Z",
  "results": [
    {
      "code": "os.system(input('cmd: '))",
      "filename": "evil.py",
      "line_number": 3,
      "line_range": [3],
      "issue_cwe": { "id": 78, "url": "..." },
      "issue_severity": "LOW",
      "issue_text": "Starting a process with a shell, possible injection detected",
      "test_id": "B602",
      "test_name": "subprocess_popen_with_shell_equals_true"
    }
  ]
}
```

---

## Usage

```bash
rakshak [options] <tool> [args...] [-- extra-tool-args...]

# Run a tool with its default args (which include the JSON-output flags).
rakshak semgrep

# Forward extra args to the tool. The `--` separator is optional in most
# cases but required when an arg looks like a rakshak flag.
rakshak semgrep -- --config p/javascript
rakshak trivy fs -- --severity HIGH,CRITICAL .

# Force a pull before running (otherwise uses local cache).
rakshak --pull gitleaks

# Run every tool against the current project.
rakshak all

# Pin to a specific upstream version (skips :latest, uses the immutable tag).
RAKSHAK_TAG=1.78.0 rakshak semgrep

# Debug — print the exact docker command that would run.
RAKSHAK_DEBUG=1 rakshak semgrep
```

### How it works

`rakshak <tool>` is sugar for:

```bash
docker run --rm \
  -w /workspace \
  -v "$PWD:/workspace:ro" \
  ${REGISTRY}/${tool}:${TAG} \
  <tool-default-args> <user-extra-args> <json-output-flags>
```

- Source mounted read-only at `/workspace`.
- Each image runs as the upstream's preferred non-root user (where one
  exists — `gitleaks` and `gosec` upstreams are root).
- The image's `ENTRYPOINT` is the tool binary; the wrapper appends
  JSON-output flags so you get machine-readable results without remembering
  per-tool flags. (`jscpd`'s image has a small wrapper entrypoint that runs
  jscpd then cats the JSON report — see `images/jscpd/entrypoint.sh`.)

---

## Configuration

The CLI reads from environment variables (or a `.env` in the project being
scanned):

| Var | Default | Purpose |
|---|---|---|
| `RAKSHAK_REGISTRY` | `git.sable-chinstrap.ts.net/rakshak` | Image registry prefix |
| `RAKSHAK_TAG` | `latest` | Image tag |
| `RAKSHAK_DOCKER` | `docker` | Docker binary path (e.g. `podman`) |
| `RAKSHAK_WORKDIR` | `$PWD` | Host path to mount at `/workspace` |
| `RAKSHAK_READONLY` | `1` | Mount source read-only (set `0` for tools that write reports) |
| `RAKSHAK_DEBUG` | unset | When `1`, prints the docker argv before running |
| `RAKSHAK_FAIL_NEVER` | unset | When `1`, always exits 0 regardless of tool exit code |

### `RAKSHAK_REGISTRY` — for forks / different Gitea hosts

If you fork the project to a different Gitea instance, override:

```bash
RAKSHAK_REGISTRY=git.your-domain.tld/yourorg rakshak list
```

Or bake it into the install by setting it in `~/.config/rakshak/env`
(sourced by your shell — no built-in support yet, just `export`).

---

## Repository layout

```
rakshak/
├── bin/rakshak.js                # CLI entry (shebang)
├── src/
│   ├── index.js                  # commander dispatch
│   ├── tools.js                  # tool manifest (image, json args)
│   ├── runner.js                 # docker spawn + exit-code passthrough
│   ├── doctor.js                 # setup verification
│   └── init.js                   # interactive first-run config
├── images/<tool>/Dockerfile      # one per tool
├── scripts/
│   ├── latest-versions.sh        # query upstream registries for latest tags
│   └── update.sh                 # bump + rebuild + push + commit
├── skills/
│   └── update-images.md          # agentic update procedure (tool-agnostic runbook)
├── .gitea/workflows/
│   └── update-images.yml         # weekly CI bump
├── Makefile                      # build / push / release
├── UPDATING.md                   # how versions are pinned and bumped
├── .env.example                  # REGISTRY + Gitea credentials
└── .npmrc.example                # @rakshak scope -> Gitea npm registry
```

---

## Maintainer setup (this repo)

### Build & push images

```bash
cp .env.example .env
# edit .env: REGISTRY, GITEA_USER, GITEA_TOKEN (token needs package:write)
make login
make build          # all 8 tools
make push           # pushes :latest and :<version>
# or one tool:
make build-semgrep push-semgrep
```

### Publish the CLI

```bash
cp .npmrc.example ~/.npmrc   # edit owner + token
npm publish                  # publishes @rakshak/cli to Gitea npm registry
```

### Keep tool images current

See [UPDATING.md](UPDATING.md). Short version:

```bash
./scripts/update.sh --check   # dry-run, show what would bump
./scripts/update.sh           # apply + build + push + commit
```

Or invoke the opencode skill:

```bash
opencode run update-images
```

Or trigger the Gitea Actions workflow from the UI:
`https://git.sable-chinstrap.ts.net/rakshak/cli/actions`

---

## Adding a tool

1. Create `images/<tool>/Dockerfile`. Use `ARG TOOL_VERSION` *before* the
   `FROM` line (Docker requirement for FROM args). Set `WORKDIR /workspace`.
2. Add an entry to `TOOLS` in `src/tools.js` with `jsonArgs` (flags the
   wrapper appends to force JSON to stdout) and `defaultArgs`.
3. Add `PIN_<tool> := <version>` to the `Makefile` and append the tool to
   the `TOOLS` list there.
4. Add a `latest_<tool>()` function to `scripts/latest-versions.sh`.
5. `make build-<tool> push-<tool>` to publish.
6. Bump the npm package version + `npm publish` so downstream users get the
   new tool in `rakshak list`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `dial tcp: lookup git.sable-chinstrap.ts.net: no such host` | Tailscale is down or you're on the wrong network | `tailscale status` |
| `denied: requested access to the resource is denied` on `docker pull` | token lacks `package:read` scope, or not logged in | `rakshak init` or `docker login git.sable-chinstrap.ts.net` |
| `unauthorized` on `npm install @rakshak/cli` | `~/.npmrc` missing or token expired | `rakshak init` |
| `adduser: uid '1000' in use` during image build | `node:*` base already has a `node` user at uid 1000 | reuse `USER node` (see `images/jscpd/Dockerfile`) |
| `failed to parse stage name "image:": invalid reference format` | Dockerfile missing `ARG TOOL_VERSION` before `FROM` | add it (see any committed Dockerfile for the pattern) |
| `Unable to find user gitleaks` (or `1000`) | upstream image has no such user | drop the `USER` directive; let the upstream's default run as-is |
| gitleaks complains `not a git repository` | gitleaks defaults to scanning git history | `git init` your project, or `rakshak gitleaks -- detect --source . --no-git` |
| Tool banner pollutes JSON parsing | banners go to stderr, JSON goes to stdout | pipe with `2>/dev/null`, e.g. `rakshak gitleaks 2>/dev/null \| jq` |

---

## License

MIT. See [LICENSE](LICENSE).
