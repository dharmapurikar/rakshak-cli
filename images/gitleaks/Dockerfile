# gitleaks - secrets in working tree + git history
ARG TOOL_VERSION
FROM zricethezav/gitleaks:${TOOL_VERSION}

# Upstream image runs as root; gitleaks is read-only on /workspace so that's OK.
WORKDIR /workspace

ENTRYPOINT ["gitleaks"]
