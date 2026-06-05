"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:https");
const { TOOLS } = require("./tools");

const REGISTRY_HOST = process.env.RAKSHAK_REGISTRY || "git.sable-chinstrap.ts.net/rakshak";
const REGISTRY_HOSTNAME = REGISTRY_HOST.split("/")[0];
const GITEA_BASE = `https://${REGISTRY_HOSTNAME}`;

// ANSI colors (disabled if not a TTY)
const C = process.stdout.isTTY
  ? { ok: "\x1b[32m", warn: "\x1b[33m", err: "\x1b[31m", dim: "\x1b[2m", off: "\x1b[0m" }
  : { ok: "", warn: "", err: "", dim: "", off: "" };

function status(label, state, detail = "") {
  const sym = state === "ok" ? "✓" : state === "warn" ? "!" : "✗";
  const col = state === "ok" ? C.ok : state === "warn" ? C.warn : C.err;
  console.log(`  ${col}${sym}${C.off} ${label.padEnd(28)} ${C.dim}${detail}${C.off}`);
}

/** Run a command, return {code, stdout, stderr}. */
function run(cmd, args, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, stdout, stderr });
    });
    child.on("error", () => {
      clearTimeout(t);
      resolve({ code: 127, stdout, stderr });
    });
  });
}

function httpHead(url, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const req = http.request(url, { method: "GET", timeout: timeoutMs }, (res) => {
      res.resume(); // drain
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode });
    });
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err.message }));
    req.end();
  });
}

async function checkDocker() {
  const { code, stdout } = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (code !== 0) {
    status("docker daemon", "err", "not reachable — start docker / join socket group");
    return false;
  }
  status("docker daemon", "ok", `v${stdout.trim()}`);
  return true;
}

async function checkTailscale() {
  // Heuristic: if registry hostname resolves and is on a tailscale IP (100.x.y.z),
  // we're good. If hostname doesn't resolve at all, tailscale is likely down.
  const { code, stdout } = await run("getent", ["hosts", REGISTRY_HOSTNAME]);
  if (code !== 0) {
    status("DNS for " + REGISTRY_HOSTNAME, "err", "hostname does not resolve — is Tailscale up?");
    return false;
  }
  const ip = stdout.split(/\s+/)[0];
  const onTs = ip.startsWith("100.") || ip.startsWith("fd7a:115c:a1e0:");
  status("Tailscale network", onTs ? "ok" : "warn", `${REGISTRY_HOSTNAME} -> ${ip}${onTs ? " (Tailscale)" : " (not a Tailscale IP)"}`);
  return true;
}

async function checkRegistry() {
  const r = await httpHead(`${GITEA_BASE}/api/v1/orgs/rakshak`);
  if (r.ok && r.status === 200) {
    status("Gitea registry reachable", "ok", `${GITEA_BASE} (HTTP ${r.status})`);
    return true;
  } else if (r.status === 401 || r.status === 403) {
    status("Gitea registry reachable", "warn", "reachable but unauthenticated — fine if you'll `rakshak init`");
    return true;
  } else if (r.status === 0) {
    status("Gitea registry reachable", "err", `${r.error} — Tailscale down or wrong host`);
    return false;
  }
  status("Gitea registry reachable", "err", `HTTP ${r.status}`);
  return false;
}

function checkNpmrc() {
  const candidates = [
    path.join(os.homedir(), ".npmrc"),
    path.join(process.cwd(), ".npmrc"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, "utf8");
    if (txt.includes("@rakshak:registry=")) {
      const hasToken = /\/\/[^/]+\/api\/packages\/[^/]+\/npm\/:_authToken=/.test(txt);
      status(`npm registry (${path.relative(os.homedir(), p) || "~/.npmrc"})`, "ok",
        hasToken ? "scope + token present" : "scope present, no token");
      return true;
    }
  }
  status("npm @rakshak scope", "warn", "not configured — run `rakshak init`");
  return false;
}

async function checkDockerAuth() {
  // Try to pull the smallest tool image. bandit is ~80MB compressed.
  // We use manifest inspect (no layer download) to be fast.
  const image = `${REGISTRY_HOST}/bandit:latest`;
  const { code, stderr } = await run("docker", ["manifest", "inspect", image], { timeoutMs: 15000 });
  if (code === 0) {
    status("docker registry auth", "ok", "manifest inspect succeeded");
    return true;
  }
  const err = stderr.trim().split("\n")[0];
  if (/unauthorized|denied/i.test(err)) {
    status("docker registry auth", "err", "unauthorized — run `rakshak init` or `docker login`");
  } else if (/no such host|connection refused/i.test(err)) {
    status("docker registry auth", "err", "registry unreachable — Tailscale?");
  } else {
    status("docker registry auth", "err", err);
  }
  return false;
}

async function checkImages() {
  // Check what's already pulled locally.
  const { stdout } = await run("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}",
    "--filter", `reference=${REGISTRY_HOST}/*`]);
  const local = new Set(stdout.trim().split("\n").filter(Boolean));
  let pulled = 0;
  for (const t of TOOLS) {
    const ref = `${REGISTRY_HOST}/${t.name}:latest`;
    if (local.has(ref)) {
      pulled++;
      status(`  ${t.name}`, "ok", "cached locally");
    } else {
      status(`  ${t.name}`, "warn", "not pulled — will pull on first scan");
    }
  }
  return pulled;
}

async function doctor() {
  console.log(`rakshak doctor — checking setup for ${GITEA_BASE}\n`);

  let ok = true;
  if (!(await checkDocker())) ok = false;
  if (!(await checkTailscale())) ok = false;
  if (!(await checkRegistry())) ok = false;
  checkNpmrc(); // warning only
  if (!(await checkDockerAuth())) ok = false;

  console.log("\nTool images:");
  const pulled = await checkImages();

  console.log(`\n${pulled}/${TOOLS.length} images cached locally.`);

  if (ok) {
    console.log(`${C.ok}Status: ready. Try 'rakshak list' or 'rakshak semgrep'.${C.off}`);
    return 0;
  }
  console.log(`${C.err}Status: not ready. Run 'rakshak init' to configure.${C.off}`);
  return 1;
}

module.exports = { doctor };
