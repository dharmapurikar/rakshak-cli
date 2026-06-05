# bandit - Python security linter
FROM python:3.12-slim

ARG TOOL_VERSION
RUN pip install --no-cache-dir bandit==${TOOL_VERSION} \
 && useradd -u 1000 -m scanner

USER scanner
WORKDIR /workspace

ENTRYPOINT ["bandit"]
