# jscpd - copy-paste / duplicate code detector
FROM node:20-alpine

ARG TOOL_VERSION
# node:alpine already ships a `node` user with uid 1000 — reuse it.
RUN npm install -g jscpd@${TOOL_VERSION}

COPY --chown=node:node entrypoint.sh /usr/local/bin/rakshak-jscpd.sh
RUN chmod +x /usr/local/bin/rakshak-jscpd.sh

USER node
WORKDIR /workspace

# Wrapper cats the JSON report to stdout so the wrapper gets machine-readable
# output (jscpd itself only writes to files).
ENTRYPOINT ["/usr/local/bin/rakshak-jscpd.sh"]
