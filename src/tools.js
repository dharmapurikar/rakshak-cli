"use strict";

const TOOLS = [
  {
    name: "semgrep",
    summary: "SAST, 35+ languages, OWASP + security-audit rules",
    // Args appended by the wrapper to force JSON output to stdout.
    // User-supplied args (after `--`) are inserted before these.
    jsonArgs: ["--json", "--quiet"],
    // Default args if user provides none of their own.
    defaultArgs: () => {
      const rules = (process.env.SEMGREP_RULES || "p/owasp-top-ten p/security-audit")
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((r) => ["--config", r]);
      return ["."].concat(rules);
    },
  },
  {
    name: "jscpd",
    summary: "Copy-paste / duplicate code detection",
    // jscpd's image has a wrapper entrypoint that runs jscpd, then cats the
    // JSON report to stdout. No jsonArgs needed here.
    jsonArgs: [],
    defaultArgs: () => ["."],
  },
  {
    name: "trivy",
    summary: "SCA, secrets, IaC, container scans",
    jsonArgs: ["--format", "json"],
    // `trivy` needs a subcommand; default is filesystem scan.
    defaultArgs: () => ["fs", "--exit-code", "0", "."],
  },
  {
    name: "gitleaks",
    summary: "Secrets in working tree + git history",
    // gitleaks 8.x supports stdout JSON via --report-format with "-" path.
    jsonArgs: ["--report-format", "json", "--report-path", "-"],
    defaultArgs: () => ["detect", "--source", "."],
  },
  {
    name: "osv-scanner",
    summary: "Dependency vulns (Google OSV database)",
    jsonArgs: ["--format", "json"],
    defaultArgs: () => ["-r", "."],
  },
  {
    name: "bandit",
    summary: "Python security linter",
    jsonArgs: ["-f", "json", "-o", "-"],
    defaultArgs: () => ["-r", "."],
  },
  {
    name: "gosec",
    summary: "Go security linter",
    jsonArgs: ["-fmt=json"],
    defaultArgs: () => ["./..."],
  },
  {
    name: "eslint-security",
    summary: "JS/TS security linter (eslint-plugin-security)",
    jsonArgs: ["--format", "json"],
    defaultArgs: () => ["."],
  },
];

const byName = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

module.exports = { TOOLS, byName };
