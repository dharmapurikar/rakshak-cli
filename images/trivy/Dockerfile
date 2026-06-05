# trivy - SCA, secrets, IaC, containers
ARG TOOL_VERSION
FROM aquasec/trivy:${TOOL_VERSION}

# Cache DBs under /workspace so host cache survives.
# The wrapper mounts $PWD at /workspace; for fresh DBs use a named volume.
USER root
RUN mkdir -p /root/.cache/trivy && chmod 755 /root/.cache/trivy
WORKDIR /workspace

ENTRYPOINT ["trivy"]
