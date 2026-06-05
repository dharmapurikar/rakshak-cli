# rakshak

Containerized security & code-quality scanners you can summon from any project.
Each tool is a pinned Docker image pushed to your self-hosted Gitea registry.
A thin npm CLI (`rakshak`) dispatches to the right container so you can run
scans from anywhere with one command.

```
$ cd my-project
$ rakshak semgrep           # runs semgrep in a container, JSON to stdout
$ rakshak trivy fs .
$ rakshak all               # runs every enabled tool, in sequence
$ rakshak list              # show configured tools and image tags
```

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

All output is **JSON** to stdout. Tool exit codes are passed through so CI
fails on findings by default.

## Repository layout

```
rakshak/
├── bin/rakshak.js          # CLI entry (shebang)
├── src/
│   ├── index.js            # commander dispatch
│   ├── tools.js            # tool manifest (image, json args, paths)
│   └── runner.js           # docker spawn + exit code passthrough
├── images/<tool>/Dockerfile
├── Makefile                # build / push / release
├── .env.example            # REGISTRY + Gitea credentials
└── .npmrc.example          # @rakshak scope -> Gitea npm registry
```

## Setup

### 1. Build & push images

```bash
cp .env.example .env
# edit .env: REGISTRY, GITEA_USER, GITEA_TOKEN

make login                  # docker login to Gitea
make build                  # builds all 8 images
make push                   # pushes all 8 images
# or one tool:
make build-semgrep push-semgrep
```

### 2. Publish the CLI to your Gitea npm registry

```bash
cp .npmrc.example ~/.npmrc  # edit owner + token
npm install                 # local dev install
npm publish                 # publishes @rakshak/cli
```

### 3. Use it from any project

```bash
npm install -g @rakshak/cli
cd /path/to/any/project
rakshak semgrep             # docker pulls if needed, runs scan, JSON to stdout
rakshak semgrep -- --config p/javascript   # extra args after --
rakshak all --output-dir ./rakshak-results
```

## How it works

`rakshak <tool>` is sugar for:

```bash
docker run --rm \
  -v "$PWD":/workspace \
  -w /workspace \
  ${REGISTRY}/${tool}:${TAG} \
  <tool-native-args-for-json-output>
```

- Source is mounted read-only at `/workspace`.
- Each image runs as a non-root user (uid 1000) so scan artifacts land with
  correct ownership.
- The image's `ENTRYPOINT` is the tool binary; the wrapper appends JSON-output
  flags so you get machine-readable results without remembering per-tool
  flags.

## Configuration

The CLI reads from env vars (or a `.env` in the project being scanned):

| Var | Default | Purpose |
|---|---|---|
| `RAKSHAK_REGISTRY` | `git.sable-chinstrap.ts.net/rakshak` | Image registry prefix |
| `RAKSHAK_TAG` | `latest` | Image tag |
| `RAKSHAK_DOCKER` | `docker` | Docker binary path (e.g. `podman`) |
| `RAKSHAK_WORKDIR` | `$PWD` | Host path to mount at `/workspace` |
| `RAKSHAK_READONLY` | `1` | Mount source read-only (set `0` for tools that write reports) |

## Adding a tool

1. Create `images/<tool>/Dockerfile`. Use a non-root user, `WORKDIR /workspace`.
2. Add an entry to `TOOLS` in `src/tools.js` with `jsonArgs` (the flags the
   wrapper appends to force JSON output to stdout).
3. `make build-<tool> push-<tool>`.

## License

MIT
