# osv-scanner - dependency vulns (Google OSV database)
FROM gcr.io/osvizone/osv-scanner:$(TOOL_VERSION)

# The upstream image runs as root by default; drop to nobody.
USER 65534
WORKDIR /workspace

ENTRYPOINT ["/osv-scanner"]
