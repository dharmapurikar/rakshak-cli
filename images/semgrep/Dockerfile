# semgrep - SAST, 35+ languages
# Official image is heavy (~1GB) but ships with the rule compiler.
FROM semgrep/semgrep:$(TOOL_VERSION)

# Default to OWASP + security-audit + auto config.
# The wrapper appends JSON-output flags; user args override.
ENV SEMGREP_RULES="p/owasp-top-ten p/security-audit p/ci"

USER semgrep
WORKDIR /workspace

ENTRYPOINT ["semgrep"]
