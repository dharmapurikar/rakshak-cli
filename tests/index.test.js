"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { imageFor, dockerBin, parseExtraArgs } = require("../src/index");

describe("index.js helper functions", () => {
  const originalRegistry = process.env.RAKSHAK_REGISTRY;
  const originalTag = process.env.RAKSHAK_TAG;
  const originalDocker = process.env.RAKSHAK_DOCKER;

  beforeEach(() => {
    delete process.env.RAKSHAK_REGISTRY;
    delete process.env.RAKSHAK_TAG;
    delete process.env.RAKSHAK_DOCKER;
  });

  afterEach(() => {
    process.env.RAKSHAK_REGISTRY = originalRegistry;
    process.env.RAKSHAK_TAG = originalTag;
    process.env.RAKSHAK_DOCKER = originalDocker;
  });

  describe("imageFor", () => {
    it("returns default registry image with tool name and tag", () => {
      const result = imageFor("semgrep");
      assert.strictEqual(result, "git.sable-chinstrap.ts.net/rakshak/semgrep:latest");
    });

    it("uses RAKSHAK_REGISTRY environment variable when set", () => {
      process.env.RAKSHAK_REGISTRY = "custom.registry.com/rakshak";
      const result = imageFor("trivy");
      assert.strictEqual(result, "custom.registry.com/rakshak/trivy:latest");
    });

    it("uses RAKSHAK_TAG environment variable when set", () => {
      process.env.RAKSHAK_TAG = "v1.2.3";
      const result = imageFor("gitleaks");
      assert.strictEqual(result, "git.sable-chinstrap.ts.net/rakshak/gitleaks:v1.2.3");
    });

    it("uses both custom registry and tag when both are set", () => {
      process.env.RAKSHAK_REGISTRY = "my.registry.io/tools";
      process.env.RAKSHAK_TAG = "stable";
      const result = imageFor("bandit");
      assert.strictEqual(result, "my.registry.io/tools/bandit:stable");
    });

    it("handles tool names with hyphens correctly", () => {
      process.env.RAKSHAK_REGISTRY = "registry.test.com";
      process.env.RAKSHAK_TAG = "latest";
      const result = imageFor("osv-scanner");
      assert.strictEqual(result, "registry.test.com/osv-scanner:latest");
    });

    it("handles tool names with underscores correctly", () => {
      process.env.RAKSHAK_REGISTRY = "registry.test.com";
      process.env.RAKSHAK_TAG = "latest";
      const result = imageFor("eslint-security");
      assert.strictEqual(result, "registry.test.com/eslint-security:latest");
    });
  });

  describe("dockerBin", () => {
    it("returns 'docker' by default", () => {
      const result = dockerBin();
      assert.strictEqual(result, "docker");
    });

    it("uses RAKSHAK_DOCKER environment variable when set", () => {
      process.env.RAKSHAK_DOCKER = "podman";
      const result = dockerBin();
      assert.strictEqual(result, "podman");
    });

    it("returns custom docker binary as-is without modification", () => {
      process.env.RAKSHAK_DOCKER = "/usr/local/bin/docker";
      const result = dockerBin();
      assert.strictEqual(result, "/usr/local/bin/docker");
    });

    it("handles case where RAKSHAK_DOCKER is empty string", () => {
      process.env.RAKSHAK_DOCKER = "";
      const result = dockerBin();
      assert.strictEqual(result, "");
    });
  });

  describe("parseExtraArgs", () => {
    it("returns empty array when no arguments", () => {
      const result = parseExtraArgs([]);
      assert.deepStrictEqual(result, []);
    });

    it("returns all args when no -- separator", () => {
      const result = parseExtraArgs(["--verbose", "--config", "rules.yaml"]);
      assert.deepStrictEqual(result, ["--verbose", "--config", "rules.yaml"]);
    });

    it("returns args after -- separator", () => {
      const result = parseExtraArgs(["--verbose", "--", "--config", "rules.yaml", "--debug"]);
      assert.deepStrictEqual(result, ["--config", "rules.yaml", "--debug"]);
    });

    it("returns empty array when -- is at the end", () => {
      const result = parseExtraArgs(["--verbose", "--"]);
      assert.deepStrictEqual(result, []);
    });

    it("returns empty array when -- is the only element", () => {
      const result = parseExtraArgs(["--"]);
      assert.deepStrictEqual(result, []);
    });

    it("handles multiple -- separators by taking only the first", () => {
      const result = parseExtraArgs(["--", "--first", "--", "--second"]);
      assert.deepStrictEqual(result, ["--first", "--", "--second"]);
    });

    it("returns single arg after -- when that's all there is", () => {
      const result = parseExtraArgs(["--", "semgrep"]);
      assert.deepStrictEqual(result, ["semgrep"]);
    });

    it("works with gitleaks-style args after --", () => {
      const result = parseExtraArgs(["--", "--config", ".gitleaks.toml", "--source", "."]);
      assert.deepStrictEqual(result, ["--config", ".gitleaks.toml", "--source", "."]);
    });

    it("works with trivy-style args after --", () => {
      const result = parseExtraArgs(["--", "--severity", "HIGH,CRITICAL", "--ignore-unfixed"]);
      assert.deepStrictEqual(result, ["--severity", "HIGH,CRITICAL", "--ignore-unfixed"]);
    });

    it("returns original args array unchanged (does not modify)", () => {
      const original = Object.freeze(["--verbose", "--", "--config"]);
      const result = parseExtraArgs(["--verbose", "--", "--config"]);
      assert.notStrictEqual(result, original);
      assert.deepStrictEqual(result, ["--config"]);
    });
  });
});

describe("buildProgram", () => {
  it("returns a commander program instance", () => {
    const { buildProgram } = require("../src/index");
    const prog = buildProgram();
    assert.ok(prog, "buildProgram should return a value");
    assert.strictEqual(typeof prog.name, "function", "should have name method");
    assert.strictEqual(typeof prog.description, "function", "should have description method");
    assert.strictEqual(typeof prog.version, "function", "should have version method");
    assert.strictEqual(typeof prog.command, "function", "should have command method");
    assert.strictEqual(typeof prog.parseAsync, "function", "should have parseAsync method");
    assert.strictEqual(prog.name(), "rakshak");
  });
});
