# jscpd - copy-paste / duplicate code detector
FROM node:20-alpine

ARG TOOL_VERSION
RUN npm install -g jscpd@${TOOL_VERSION} \
 && adduser -D -u 1000 scanner

COPY --chown=scanner:scanner entrypoint.sh /usr/local/bin/rakshak-jscpd.sh
RUN chmod +x /usr/local/bin/rakshak-jscpd.sh

USER scanner
WORKDIR /workspace

# Wrapper cats the JSON report to stdout so the wrapper gets machine-readable
# output (jscpd itself only writes to files).
ENTRYPOINT ["/usr/local/bin/rakshak-jscpd.sh"]
