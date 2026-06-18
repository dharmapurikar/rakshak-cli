"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { buildArgv, resolveWorkdir } = require("../src/runner");

describe("runner.js", () => {
  describe("buildArgv", () => {
    const minimalOpts = {
      image: "registry.example.com/semgrep:latest",
      workdir: "/project",
      userArgs: undefined,
      defaultArgs: ["."],
      jsonArgs: ["--json"],
    };

    it("returns an array starting with 'run' and '--rm'", () => {
      const argv = buildArgv(minimalOpts);
      assert.strictEqual(argv[0], "run");
      assert.strictEqual(argv[1], "--rm");
    });

    it("includes --rm flag for container cleanup", () => {
      const argv = buildArgv(minimalOpts);
      assert.ok(argv.includes("--rm"), "argv should include --rm flag");
    });

    it("sets working directory to /workspace inside container", () => {
      const argv = buildArgv(minimalOpts);
      const wIdx = argv.indexOf("-w");
      assert.ok(wIdx !== -1, "should have -w flag");
      assert.strictEqual(argv[wIdx + 1], "/workspace");
    });

    it("mounts workdir as volume", () => {
      const opts = { ...minimalOpts, workdir: "/my/project" };
      const argv = buildArgv(opts);
      const vIdx = argv.indexOf("-v");
      assert.ok(vIdx !== -1, "should have -v flag");
      assert.ok(argv[vIdx + 1].includes("/my/project"), "should include workdir path");
      assert.ok(argv[vIdx + 1].includes("/workspace"), "should include container mount point");
    });

    it("mounts workdir read-only by default", () => {
      const opts = { ...minimalOpts, workdir: "/my/project" };
      const argv = buildArgv(opts);
      const vIdx = argv.indexOf("-v");
      assert.ok(argv[vIdx + 1].endsWith(":ro"), "should mount as read-only by default");
    });

    it("can mount workdir read-write when readOnly is false", () => {
      const opts = { ...minimalOpts, workdir: "/my/project", readOnly: false };
      const argv = buildArgv(opts);
      const vIdx = argv.indexOf("-v");
      assert.ok(!argv[vIdx + 1].endsWith(":ro"), "should not mount as read-only");
    });

    it("still mounts read-only when readOnly is explicitly true", () => {
      const opts = { ...minimalOpts, workdir: "/my/project", readOnly: true };
      const argv = buildArgv(opts);
      const vIdx = argv.indexOf("-v");
      assert.ok(argv[vIdx + 1].endsWith(":ro"), "should mount as read-only when explicitly true");
    });

    it("includes the image reference after volume mount", () => {
      const opts = { ...minimalOpts, image: "registry.example.com/trivy:latest", jsonArgs: [] };
      const argv = buildArgv(opts);
      const vIdx = argv.indexOf("-v");
      assert.strictEqual(argv[vIdx + 2], "registry.example.com/trivy:latest");
    });

    it("uses userArgs when provided and non-empty", () => {
      const opts = {
        ...minimalOpts,
        userArgs: ["--config", "custom.yaml", "--verbose"],
        defaultArgs: ["."],
      };
      const argv = buildArgv(opts);
      assert.ok(argv.includes("--config"), "should include user args");
      assert.ok(argv.includes("custom.yaml"), "should include user arg value");
    });

    it("falls back to defaultArgs when userArgs is undefined", () => {
      const opts = {
        ...minimalOpts,
        userArgs: undefined,
        defaultArgs: ["--config", "default.yaml"],
        jsonArgs: [],
      };
      const argv = buildArgv(opts);
      assert.ok(argv.includes("--config"), "should use defaultArgs when userArgs is undefined");
      assert.ok(argv.includes("default.yaml"), "should include default arg value");
    });

    it("falls back to defaultArgs when userArgs is empty array", () => {
      const opts = {
        ...minimalOpts,
        userArgs: [],
        defaultArgs: ["--config", "default.yaml"],
        jsonArgs: [],
      };
      const argv = buildArgv(opts);
      assert.ok(argv.includes("--config"), "should use defaultArgs when userArgs is empty");
    });

    it("appends jsonArgs at the end", () => {
      const opts = {
        ...minimalOpts,
        userArgs: ["--verbose"],
        defaultArgs: [],
        jsonArgs: ["--format", "json", "--quiet"],
      };
      const argv = buildArgv(opts);
      const lastArgs = argv.slice(-3);
      assert.deepStrictEqual(lastArgs, ["--format", "json", "--quiet"]);
    });

    it("handles empty jsonArgs array", () => {
      const opts = { ...minimalOpts, jsonArgs: [], defaultArgs: [] };
      const argv = buildArgv(opts);
      const imageIdx = argv.indexOf(minimalOpts.image);
      const afterImg = argv.slice(imageIdx + 1);
      assert.strictEqual(afterImg.length, 0, "should have no args after image when jsonArgs is empty");
    });

    it("accepts dockerBin option (used by runContainer, not buildArgv)", () => {
      const opts = { ...minimalOpts, dockerBin: "podman" };
      const argv = buildArgv(opts);
      assert.ok(Array.isArray(argv), "buildArgv should return array even with dockerBin option");
      assert.strictEqual(argv[0], "run", "first arg should be 'run' not the docker binary");
    });

    it("works with semgrep-like arguments", () => {
      const opts = {
        image: "registry.example.com/semgrep:latest",
        workdir: "/code",
        userArgs: undefined,
        defaultArgs: [".", "--config", "p/owasp-top-ten"],
        jsonArgs: ["--json", "--quiet"],
      };
      const argv = buildArgv(opts);
      assert.ok(argv.includes("--json"), "should include json arg");
      assert.ok(argv.includes("--quiet"), "should include quiet flag");
    });

    it("works with trivy filesystem scan arguments", () => {
      const opts = {
        image: "registry.example.com/trivy:latest",
        workdir: "/project",
        userArgs: undefined,
        defaultArgs: ["fs", "--exit-code", "0", "."],
        jsonArgs: ["--format", "json"],
      };
      const argv = buildArgv(opts);
      assert.ok(argv.includes("fs"), "should include fs subcommand");
      assert.ok(argv.includes("--exit-code"), "should include exit-code flag");
      assert.ok(argv.includes("0"), "should include exit code 0");
      assert.ok(argv.includes("--format"), "should include format flag");
      assert.ok(argv.includes("json"), "should include json format");
    });
  });

  describe("resolveWorkdir", () => {
    const originalCwd = process.cwd();
    const originalWorkdir = process.env.RAKSHAK_WORKDIR;
    let tempDir;

    beforeEach(() => {
      tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rakshak-test-")));
    });

    afterEach(() => {
      process.env.RAKSHAK_WORKDIR = originalWorkdir;
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      process.chdir(originalCwd);
    });

    it("returns RAKSHAK_WORKDIR when set", () => {
      process.env.RAKSHAK_WORKDIR = tempDir;
      const result = resolveWorkdir();
      assert.strictEqual(result, tempDir);
    });

    it("returns current working directory when RAKSHAK_WORKDIR is not set", () => {
      delete process.env.RAKSHAK_WORKDIR;
      process.chdir(tempDir);
      const result = resolveWorkdir();
      assert.strictEqual(result, tempDir);
    });

    it("resolves relative paths to absolute", () => {
      const parentDir = path.dirname(tempDir);
      const relativePath = "./" + path.basename(tempDir);
      process.env.RAKSHAK_WORKDIR = relativePath;
      process.chdir(parentDir);
      const result = resolveWorkdir();
      assert.strictEqual(result, tempDir);
    });

    it("throws error when workdir does not exist", () => {
      const nonExistent = path.join(os.tmpdir(), "does-not-exist-" + Date.now());
      process.env.RAKSHAK_WORKDIR = nonExistent;
      assert.throws(
        () => resolveWorkdir(),
        /workdir does not exist/,
        "should throw error for non-existent directory"
      );
    });

    it("throws error with informative message", () => {
      const nonExistent = "/this/path/definitely/does/not/exist";
      process.env.RAKSHAK_WORKDIR = nonExistent;
      try {
        resolveWorkdir();
        assert.fail("should have thrown an error");
      } catch (err) {
        assert.ok(err.message.includes(nonExistent), "error should include the path");
      }
    });

    it("returns absolute path even when RAKSHAK_WORKDIR is relative", () => {
      const parentDir = path.dirname(tempDir);
      const relativePath = "./" + path.basename(tempDir);
      process.env.RAKSHAK_WORKDIR = relativePath;
      process.chdir(parentDir);
      const result = resolveWorkdir();
      assert.strictEqual(result, tempDir);
      assert.ok(path.isAbsolute(result), "result should be absolute");
    });
  });
});
