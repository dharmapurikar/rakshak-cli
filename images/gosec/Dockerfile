# gosec - Go security checker
ARG TOOL_VERSION
FROM securego/gosec:${TOOL_VERSION}

# Upstream image runs as root; gosec is read-only on /workspace so that's OK.
WORKDIR /workspace

ENTRYPOINT ["gosec"]
