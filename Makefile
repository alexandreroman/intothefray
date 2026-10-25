# Developer task runner. Run `make` (or `make help`) to
# list the available targets.

.DEFAULT_GOAL := help

# Canonical environment, loaded for every target.
# A missing .env file is not an error.
ifneq (,$(wildcard .env))
include .env
export
endif

# Local overrides, loaded only for the development targets of DEV_TARGETS:
# the stack (app-*), build, web-build and packs targets read .env only.
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
INFRA_SERVICES := redis web

##@ Infra

# The server runs on the host in dev, so Caddy proxies to it; app-up keeps the
# compose default (the app container). --no-deps: the app service is not part
# of the dev infrastructure.
.PHONY: infra-up
infra-up: ## Start local infrastructure services (Redis, Caddy)
	mkdir -p web/dist
	API_UPSTREAM=host.docker.internal:$${PORT:-9000} $(COMPOSE) up -d --wait --no-deps $(INFRA_SERVICES)

.PHONY: infra-down
infra-down: ## Stop local infrastructure services
	$(COMPOSE) stop $(INFRA_SERVICES)

.PHONY: infra-logs
infra-logs: ## Follow logs from infrastructure services
	$(COMPOSE) logs -f $(INFRA_SERVICES)

##@ Stack

.PHONY: app-up
app-up: web-build ## Build and start the full stack (web + server + Redis)
	$(COMPOSE) up -d --build --wait

.PHONY: app-down
app-down: ## Stop and remove the full stack
	$(COMPOSE) down

.PHONY: app-logs
app-logs: ## Follow logs from the full stack
	$(COMPOSE) logs -f

##@ Develop

.PHONY: dev
dev: infra-up web-install ## Start infra, then run the API (hot reload) and the web build (reload the page)
	# Trap reaps the whole process group (kill 0) on exit or signal, so no
	# orphaned processes survive Ctrl-C or a child crash.
	@trap 'kill 0' EXIT INT TERM; \
		( air; kill 0 ) & \
		( cd web && pnpm watch; kill 0 ) & \
		wait

##@ Web

.PHONY: web-install
web-install: ## Install the web dependencies
	cd web && pnpm install --frozen-lockfile

.PHONY: web-check
web-check: ## Type-check, lint and test the web app
	cd web && pnpm check && pnpm lint && pnpm test

.PHONY: web-build
web-build: web-install ## Build the web app into web/dist/
	cd web && pnpm build

##@ Data

.PHONY: packs
packs: ## Regenerate card packs from marvelcdb, mc4db and Cerebro
	go run ./cmd/packgen

##@ Quality

.PHONY: test
test: ## Run the Go tests (race detector)
	go test -race -shuffle=on ./...

.PHONY: check
check: test web-check ## Run tests and static checks
	golangci-lint run

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
