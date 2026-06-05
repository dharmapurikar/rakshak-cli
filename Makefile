# Makefile for rakshak container images.
# Source .env for REGISTRY, TAG, GITEA_USER, GITEA_TOKEN.

ENV ?= .env
ifneq (,$(wildcard $(ENV)))
    include $(ENV)
    export
endif

REGISTRY ?= git.sable-chinstrap.ts.net/rakshak
TAG      ?= latest

TOOLS := semgrep jscpd trivy gitleaks osv-scanner bandit gosec eslint-security

# Pinned upstream versions. Bump centrally here.
PIN_semgrep         := 1.78.0
PIN_jscpd           := 3.5.10
PIN_trivy           := 0.52.2
PIN_gitleaks        := v8.24.3
PIN_osv-scanner     := v1.8.5
PIN_bandit          := 1.7.9
PIN_gosec           := 2.20.0
PIN_eslint-security := 3.0.1

.PHONY: help
help:
	@echo "rakshak image build targets"
	@echo ""
	@echo "  make login              docker login to \$$REGISTRY"
	@echo "  make build              build all tools"
	@echo "  make push               push all tools"
	@echo "  make release            build + push all tools"
	@echo "  make build-<tool>       build one tool"
	@echo "  make push-<tool>        push one tool"
	@echo "  make clean              remove local images"
	@echo ""
	@echo "Tools: $(TOOLS)"
	@echo "Registry: $(REGISTRY)   Tag: $(TAG)"

.PHONY: login
login:
	@test -n "$$GITEA_USER" -a -n "$$GITEA_TOKEN" || (echo "Set GITEA_USER and GITEA_TOKEN in .env"; exit 1)
	docker login $(REGISTRY) -u $$GITEA_USER -p $$GITEA_TOKEN

.PHONY: build push release clean
build: $(addprefix build-,$(TOOLS))
push:  $(addprefix push-,$(TOOLS))
release: build push
clean:
	@for t in $(TOOLS); do \
	  docker rmi $(REGISTRY)/$$t:$(TAG) 2>/dev/null || true; \
	done

# Per-tool targets. The leading `eval` block generates
#   build-<tool>, push-<tool>, run-<tool>
# for every entry in TOOLS.
define TOOL_template
.PHONY: build-$(1) push-$(1) run-$(1)
build-$(1):
	docker build \
	  --build-arg TOOL_VERSION=$(PIN_$(1)) \
	  -t $(REGISTRY)/$(1):$(TAG) \
	  -t $(REGISTRY)/$(1):$(PIN_$(1)) \
	  images/$(1)

push-$(1): build-$(1)
	docker push $(REGISTRY)/$(1):$(TAG)
	docker push $(REGISTRY)/$(1):$(PIN_$(1))

run-$(1):
	@node bin/rakshak.js $(1) $(ARGS)
endef

$(foreach t,$(TOOLS),$(eval $(call TOOL_template,$(t))))
