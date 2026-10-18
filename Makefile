# Developer task runner. Run `make` (or `make help`) to
# list the available targets.

.DEFAULT_GOAL := help

# Canonical environment, loaded for every target.
# A missing .env file is not an error.
ifneq (,$(wildcard .env))
include .env
export
endif

# Local overrides, loaded only for dev/test targets so that
# deploy/release targets see the canonical .env values only.
# Sequential include means later assignments win.
DEV_TARGETS := dev test check web-install web-check infra-up infra-down infra-logs
GOALS := $(or $(MAKECMDGOALS),$(.DEFAULT_GOAL))
ifneq (,$(filter $(DEV_TARGETS),$(GOALS)))
ifneq (,$(wildcard .env.local))
include .env.local
export
endif
endif

COMPOSE := docker compose
INFRA_SERVICES := redis

##@ Infra

.PHONY: infra-up
infra-up: ## Start local infrastructure services (Redis)
	$(COMPOSE) up -d --wait $(INFRA_SERVICES)

.PHONY: infra-down
infra-down: ## Stop local infrastructure services
	$(COMPOSE) stop $(INFRA_SERVICES)

.PHONY: infra-logs
infra-logs: ## Follow logs from infrastructure services
	$(COMPOSE) logs -f $(INFRA_SERVICES)

##@ Stack

.PHONY: app-up
app-up: ## Build and start the full stack (app + Redis)
	$(COMPOSE) up -d --build --wait

.PHONY: app-down
app-down: ## Stop and remove the full stack
	$(COMPOSE) down

.PHONY: app-logs
app-logs: ## Follow logs from the full stack
	$(COMPOSE) logs -f

##@ Develop

.PHONY: dev
dev: infra-up web-install ## Start infra, then run the API and the web app with hot reload
	# Trap reaps the whole process group (kill 0) on exit or signal, so no
	# orphaned processes survive Ctrl-C or a child crash. For multiple dev
	# processes, background each as `( cmd; kill 0 ) &` before the wait.
	@trap 'kill 0' EXIT INT TERM; \
		( air; kill 0 ) & \
		( cd web && pnpm dev; kill 0 ) & \
		wait

##@ Web

.PHONY: web-install
web-install: ## Install the web dependencies
	cd web && pnpm install --frozen-lockfile

.PHONY: web-check
web-check: ## Type-check, lint and test the web app
	cd web && pnpm check && pnpm lint && pnpm test

.PHONY: web-build
web-build: ## Build the web app into web/dist/
	cd web && pnpm build

##@ Data

.PHONY: packs
packs: ## Regenerate card packs from marvelcdb and Cerebro
	go run ./cmd/packgen -out packs/dist -cache packs/.cache -curated packs/curated

##@ Quality

.PHONY: test
test: ## Run the test suite
	go test -race -shuffle=on ./...

.PHONY: check
check: test web-check ## Run tests and static checks
	golangci-lint run ./...

##@ Build

.PHONY: build
build: ## Build the production binary into bin/
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/intothefray ./cmd/intothefray

##@ Helpers

.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make \033[36m<target>\033[0m\n"} \
		/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(firstword $(MAKEFILE_LIST))
