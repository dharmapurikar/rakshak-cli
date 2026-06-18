"use strict";

const { describe, it, beforeEach, mock } = require("node:test");
const assert = require("node:assert");
const { TOOLS, byName } = require("../src/tools");

const EXPECTED_TOOL_NAMES = [
  "semgrep",
  "jscpd",
  "trivy",
  "gitleaks",
  "osv-scanner",
  "bandit",
  "gosec",
  "eslint-security",
];

describe("tools.js", () => {
  describe("TOOLS array", () => {
    it("contains all expected security tools", () => {
      const toolNames = TOOLS.map((t) => t.name);
      for (const name of EXPECTED_TOOL_NAMES) {
        assert.ok(
          toolNames.includes(name),
          `Expected tool "${name}" to be in TOOLS array`
        );
      }
    });

    it("has exactly 8 tools", () => {
      assert.strictEqual(TOOLS.length, 8);
    });

    it("each tool has required fields", () => {
      for (const tool of TOOLS) {
        assert.ok(tool.name, "tool must have a name");
        assert.ok(tool.summary, "tool must have a summary");
        assert.ok(Array.isArray(tool.jsonArgs), "tool must have jsonArgs array");
        assert.ok(
          typeof tool.defaultArgs === "function",
          "tool must have defaultArgs function"
        );
      }
    });

    it("each tool name is unique", () => {
      const names = TOOLS.map((t) => t.name);
      const uniqueNames = new Set(names);
      assert.strictEqual(
        uniqueNames.size,
        names.length,
        "Tool names must be unique"
      );
    });

    it("all tool names are lowercase with hyphens or underscores", () => {
      for (const tool of TOOLS) {
        assert.ok(
          /^[a-z0-9_-]+$/.test(tool.name),
          `Tool name "${tool.name}" should only contain lowercase letters, numbers, hyphens, or underscores`
        );
      }
    });
  });

  describe("byName lookup", () => {
    it("returns tool for each known tool name", () => {
      for (const name of EXPECTED_TOOL_NAMES) {
        const tool = byName[name];
        assert.ok(tool, `byName["${name}"] should return a tool`);
        assert.strictEqual(tool.name, name);
      }
    });

    it("returns undefined for unknown tool names", () => {
      assert.strictEqual(byName["unknown-tool"], undefined);
      assert.strictEqual(byName[""], undefined);
      assert.strictEqual(byName["Semgrep"], undefined);
      assert.strictEqual(byName[null], undefined);
      assert.strictEqual(byName[undefined], undefined);
    });

    it("byName has same length as TOOLS array", () => {
      assert.strictEqual(Object.keys(byName).length, TOOLS.length);
    });
  });

  describe("tool-specific behavior", () => {
    it("semgrep defaultArgs uses SEMGREP_RULES env var", () => {
      const semgrep = byName["semgrep"];
      const envMock = { SEMGREP_RULES: "p/ci p/security-audit" };
      const originalEnv = process.env.SEMGREP_RULES;

      process.env.SEMGREP_RULES = envMock.SEMGREP_RULES;
      try {
        const args = semgrep.defaultArgs();
        assert.ok(args.includes("--config"), "should include --config flags");
        assert.ok(args.includes("p/ci"), "should include rule from env");
        assert.ok(args.includes("p/security-audit"), "should include second rule");
      } finally {
        if (originalEnv !== undefined) {
          process.env.SEMGREP_RULES = originalEnv;
        } else {
          delete process.env.SEMGREP_RULES;
        }
      }
    });

    it("semgrep defaultArgs falls back to OWASP rules when SEMGREP_RULES is not set", () => {
      const semgrep = byName["semgrep"];
      const originalEnv = process.env.SEMGREP_RULES;
      delete process.env.SEMGREP_RULES;

      try {
        const args = semgrep.defaultArgs();
        assert.ok(args.includes("--config"), "should include --config flags");
        assert.ok(args.includes("p/owasp-top-ten"), "should include default OWASP rule");
        assert.ok(args.includes("p/security-audit"), "should include default security-audit rule");
      } finally {
        if (originalEnv !== undefined) {
          process.env.SEMGREP_RULES = originalEnv;
        }
      }
    });

    it("trivy defaultArgs includes fs subcommand", () => {
      const trivy = byName["trivy"];
      const args = trivy.defaultArgs();
      assert.ok(args.includes("fs"), "trivy should default to filesystem scan");
      assert.ok(args.includes("--exit-code"), "trivy should have exit-code flag");
      assert.ok(args.includes("0"), "trivy should exit with code 0 on success");
    });

    it("gitleaks defaultArgs includes detect subcommand", () => {
      const gitleaks = byName["gitleaks"];
      const args = gitleaks.defaultArgs();
      assert.ok(args.includes("detect"), "gitleaks should use detect subcommand");
      assert.ok(args.includes("--source"), "gitleaks should have --source flag");
    });

    it("bandit defaultArgs includes recursive flag", () => {
      const bandit = byName["bandit"];
      const args = bandit.defaultArgs();
      assert.ok(args.includes("-r"), "bandit should use recursive flag");
    });

    it("gosec defaultArgs uses ./... for Go projects", () => {
      const gosec = byName["gosec"];
      const args = gosec.defaultArgs();
      assert.deepStrictEqual(args, ["./..."]);
    });

    it("all jsonArgs are appropriate for JSON output", () => {
      for (const tool of TOOLS) {
      if (tool.jsonArgs.length > 0) {
        const jsonArgPatterns = [
          /--json/,
          /--format.*json/,
          /-f.*json/,
          /-fmt=json/,
          /--report-format.*json/,
        ];
        const combinedArgs = tool.jsonArgs.join(" ");
        const hasJsonArg = tool.jsonArgs.some((arg) =>
          jsonArgPatterns.some((pattern) => pattern.test(arg))
        ) || jsonArgPatterns.some((pattern) => pattern.test(combinedArgs));
        assert.ok(
          hasJsonArg,
          `Tool "${tool.name}" jsonArgs should contain a JSON format flag`
        );
      }
      }
    });
  });
});
