# eslint + eslint-plugin-security - JS/TS security linter
FROM node:20-alpine

ARG TOOL_VERSION
# node:alpine already ships a `node` user with uid 1000 — reuse it.
RUN npm install -g eslint@^9.0.0 eslint-plugin-security@${TOOL_VERSION} \
 && mkdir -p /conf && chown node:node /conf

# Bake a minimal config that enables the security plugin.
COPY --chown=node:node eslint.config.mjs /conf/eslint.config.mjs

ENV ESLINT_USE_FLAT_CONFIG=true
USER node
WORKDIR /workspace

ENTRYPOINT ["eslint", "-c", "/conf/eslint.config.mjs"]
