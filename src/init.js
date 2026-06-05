"use strict";

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { doctor } = require("./doctor");

const REGISTRY_HOST = process.env.RAKSHAK_REGISTRY || "git.sable-chinstrap.ts.net/rakshak";
const REGISTRY_HOSTNAME = REGISTRY_HOST.split("/")[0];
const GITEA_BASE = `https://${REGISTRY_HOSTNAME}`;
const NPM_REGISTRY = `${GITEA_BASE}/api/packages/rakshak/npm/`;

function pipeRun(cmd, args, input) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "inherit", "inherit"] });
    if (input != null) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on("close", resolve);
    child.on("error", () => resolve(127));
  });
}

function appendNpmrc(scopeLine, authLine) {
  const p = path.join(os.homedir(), ".npmrc");
  let txt = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  // Remove existing @rakshak entries to make this idempotent.
  txt = txt
    .split("\n")
    .filter((l) =>
      !l.startsWith("@rakshak:") &&
      !l.includes("/api/packages/rakshak/npm/:_authToken"))
    .join("\n")
    .replace(/\n+$/, "");
  txt += `\n${scopeLine}\n${authLine}\n`;
  fs.writeFileSync(p, txt, { mode: 0o600 });
  console.log(`  wrote ${p} (mode 600)`);
}

async function init() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log(`rakshak init — configure access to ${GITEA_BASE}\n`);
  console.log("This writes:");
  console.log("  - ~/.npmrc with @rakshak scope + auth token");
  console.log("  - docker config with Gitea container registry login\n");

  // --- token ---
  let token = process.env.GITEA_TOKEN || "";
  if (!token) {
    token = (await rl.question("Gitea personal access token (package:write + repo scopes): ")).trim();
  } else {
    console.log("  using $GITEA_TOKEN from environment.");
  }
  rl.close();

  if (!token) {
    console.error("\nA token is required. Generate one at:");
    console.error(`  ${GITEA_BASE}/user/settings/applications`);
    return 1;
  }

  // --- npm ---
  console.log("\n[1/2] npm configuration");
  appendNpmrc(
    `@rakshak:registry=${NPM_REGISTRY}`,
    `//${REGISTRY_HOSTNAME}/api/packages/rakshak/npm/:_authToken=${token}`,
  );

  // --- docker ---
  const user = process.env.GITEA_USER || "dharmapurikar";
  console.log(`\n[2/2] docker login as ${user}`);
  const code = await pipeRun(
    "docker", ["login", REGISTRY_HOSTNAME, "-u", user, "--password-stdin"],
    token,
  );
  if (code !== 0) {
    console.error("docker login failed (exit " + code + ")");
    return code;
  }

  // --- verify ---
  console.log("\nVerification:");
  await doctor();
  console.log(`\nNext: cd to any project and run 'rakshak semgrep' / 'rakshak all'.`);
  return 0;
}

module.exports = { init };
