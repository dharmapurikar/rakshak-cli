"use strict";

const { program } = require("commander");
const { TOOLS, byName } = require("./tools");
const { buildArgv, runContainer, pullImage, resolveWorkdir } = require("./runner");
const { doctor } = require("./doctor");
const { init } = require("./init");
const pkg = require("../package.json");

function env(name, fallback) {
  return process.env[name] !== undefined ? process.env[name] : fallback;
}

function imageFor(tool) {
  const registry = env("RAKSHAK_REGISTRY", "git.sable-chinstrap.ts.net/rakshak");
  const tag = env("RAKSHAK_TAG", "latest");
  return `${registry}/${tool}:${tag}`;
}

function dockerBin() {
  return env("RAKSHAK_DOCKER", "docker");
}

function parseExtraArgs(argvSlice) {
  // commander hands us `args` which is everything after the tool name.
  // We honor a literal `--` separator: anything after it is forwarded verbatim.
  const idx = argvSlice.indexOf("--");
  return idx >= 0 ? argvSlice.slice(idx + 1) : argvSlice;
}

async function runTool(name, userArgs, opts = {}) {
  const tool = byName[name];
  if (!tool) {
    console.error(`unknown tool: ${name}. try \`rakshak list\`.`);
    process.exit(2);
  }
  const workdir = resolveWorkdir();
  const image = imageFor(name);

  if (opts.pull) {
    const code = await pullImage(image, { dockerBin: dockerBin() });
    if (code !== 0) {
      console.error(`failed to pull ${image} (exit ${code})`);
      process.exit(code || 1);
    }
  }

  const argv = buildArgv({
    image,
    workdir,
    userArgs,
    defaultArgs: typeof tool.defaultArgs === "function" ? tool.defaultArgs() : tool.defaultArgs,
    jsonArgs: tool.jsonArgs,
    readOnly: env("RAKSHAK_READONLY", "1") === "1",
    dockerBin: dockerBin(),
  });

  if (process.env.RAKSHAK_DEBUG === "1") {
    console.error(`+ ${dockerBin()} ${argv.join(" ")}`);
  }

  const code = await runContainer(argv, { dockerBin: dockerBin() });

  if (process.env.RAKSHAK_FAIL_NEVER === "1") return 0;
  return code;
}

function buildProgram() {
  program
    .name("rakshak")
    .description("Containerized security & quality scanners. Run any tool against the current project.")
    .version(pkg.version)
    .option("--pull", "docker pull the image before running")
    .option("--debug", "print the docker command that would be run");

  program
    .command("doctor")
    .description("verify docker, registry, auth, and image cache are configured correctly")
    .action(async () => {
      const code = await doctor();
      process.exit(code);
    });

  program
    .command("init")
    .description("interactive first-run setup: writes ~/.npmrc + docker login for the Gitea registry")
    .action(async () => {
      const code = await init();
      process.exit(code);
    });

  program
    .command("list")
    .description("list configured tools and image refs")
    .action(() => {
      const registry = env("RAKSHAK_REGISTRY", "git.sable-chinstrap.ts.net/rakshak");
      const tag = env("RAKSHAK_TAG", "latest");
      console.log(`registry: ${registry}`);
      console.log(`tag:      ${tag}`);
      console.log("");
      for (const t of TOOLS) {
        console.log(`  ${t.name.padEnd(18)} ${registry}/${t.name}:${tag}`);
        console.log(`  ${"".padEnd(18)} ${t.summary}`);
      }
    });

  program
    .command("pull [tool]")
    .description("pull one tool image, or all if omitted")
    .action(async (name) => {
      const targets = name ? [name] : TOOLS.map((t) => t.name);
      for (const n of targets) {
        if (!byName[n]) {
          console.error(`unknown tool: ${n}`);
          continue;
        }
        const code = await pullImage(imageFor(n), { dockerBin: dockerBin() });
        if (code !== 0) console.error(`! ${n} pull failed (exit ${code})`);
        else console.log(`✓ ${n}`);
      }
    });

  program
    .command("all [args...]")
    .description("run every tool in sequence, JSON to stdout")
    .action(async (args) => {
      const userArgs = parseExtraArgs(args);
      let final = 0;
      for (const t of TOOLS) {
        console.error(`\n=== ${t.name} ===`);
        const code = await runTool(t.name, userArgs, { pull: program.opts().pull });
        if (code !== 0) final = code;
      }
      process.exit(final);
    });

  // Catch-all: `rakshak <tool> [...args]`
  program
    .argument("[tool]", "tool name (semgrep, trivy, ...)")
    .argument("[args...]", "extra args forwarded to the tool; use -- to disambiguate")
    .allowUnknownOption(true)
    .action(async (tool, args) => {
      if (!tool) {
        // No args: show quickstart with a hint to doctor/init.
        console.log(`rakshak v${pkg.version} — containerized security scanners\n`);
        console.log("Quick start:");
        console.log("  rakshak doctor       verify docker, registry, and auth");
        console.log("  rakshak init         interactive first-run setup");
        console.log("  rakshak list         show configured tools and image refs");
        console.log("  rakshak <tool>       run a tool (semgrep, trivy, gitleaks, ...)");
        console.log("  rakshak all          run every tool, JSON to stdout\n");
        console.log("Docs: https://git.sable-chinstrap.ts.net/rakshak/cli");
        return;
      }
      if (!byName[tool]) {
        console.error(`unknown tool: ${tool}. try \`rakshak list\`.`);
        process.exit(2);
      }
      const userArgs = parseExtraArgs(args);
      const code = await runTool(tool, userArgs, { pull: program.opts().pull });
      process.exit(code);
    });

  return program;
}

function run() {
  const prog = buildProgram();
  prog.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run, buildProgram, runTool };
