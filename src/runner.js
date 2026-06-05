"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Build the `docker run` argv for a given tool + user args.
 *
 * @param {object} opts
 * @param {string} opts.image         Fully-qualified image ref.
 * @param {string} opts.workdir       Host path to mount at /workspace.
 * @param {string[]} opts.userArgs    Args the user passed after `--`.
 * @param {string[]} opts.defaultArgs Args to use if userArgs is empty.
 * @param {string[]} opts.jsonArgs    Args appended to force JSON output.
 * @param {string}  [opts.outputFile] If set, this path inside the container
 *                                    holds the JSON; the runner cats it out.
 * @param {boolean} [opts.readOnly]   Mount /workspace read-only.
 * @param {string}  [opts.dockerBin]  docker / podman binary.
 * @returns {string[]}                Argv for spawn.
 */
function buildArgv(opts) {
  const readOnly = opts.readOnly !== false;
  const mount = readOnly ? "${WORKDIR}:/workspace:ro" : "${WORKDIR}:/workspace";

  const args = [
    "run",
    "--rm",
    "-w",
    "/workspace",
    "-v",
    mount.replace("${WORKDIR}", opts.workdir),
    // Tools (gitleaks, jscpd) may need to read .git — that's still inside
    // the read-only mount, so we're fine. jscpd writes reports to /tmp.
    opts.image,
  ];

  const effective = (opts.userArgs && opts.userArgs.length ? opts.userArgs : opts.defaultArgs) || [];
  return args.concat(effective).concat(opts.jsonArgs || []);
}

/**
 * Run a tool container. Resolves with the container exit code.
 * Streams stdout/stderr straight to the parent so JSON lands on stdout.
 */
function runContainer(argv, { dockerBin = "docker" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, argv, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", resolve);
  });
}

/**
 * Pull an image. Quiet by default.
 */
function pullImage(image, { dockerBin = "docker" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin, ["pull", image], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", resolve);
  });
}

/**
 * Resolve the workdir. RAKSHAK_WORKDIR wins, then $PWD.
 */
function resolveWorkdir() {
  const wd = process.env.RAKSHAK_WORKDIR || process.cwd();
  const abs = path.resolve(wd);
  if (!fs.existsSync(abs)) {
    throw new Error(`workdir does not exist: ${abs}`);
  }
  return abs;
}

module.exports = { buildArgv, runContainer, pullImage, resolveWorkdir };
