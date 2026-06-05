# osv-scanner - dependency vulns (Google OSV database)
# Published to GHCR (gcr.io mirror is auth-only).
ARG TOOL_VERSION
FROM ghcr.io/google/osv-scanner:${TOOL_VERSION}

# Upstream image runs as root; drop to nobody.
USER 65534
WORKDIR /workspace

ENTRYPOINT ["/osv-scanner"]
