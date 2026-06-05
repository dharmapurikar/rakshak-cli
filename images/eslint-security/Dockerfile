# eslint + eslint-plugin-security - JS/TS security linter
FROM node:20-alpine

ARG TOOL_VERSION
RUN npm install -g eslint@^9.0.0 eslint-plugin-security@${TOOL_VERSION} \
 && adduser -D -u 1000 scanner \
 && mkdir -p /conf && chown scanner /conf

# Bake a minimal config that enables the security plugin.
COPY --chown=scanner:scanner eslint.config.mjs /conf/eslint.config.mjs

ENV ESLINT_USE_FLAT_CONFIG=true
USER scanner
WORKDIR /workspace

ENTRYPOINT ["eslint", "-c", "/conf/eslint.config.mjs"]
