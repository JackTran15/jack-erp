PNPM ?= pnpm

API_FILTER := @erp/api
BACKOFFICE_FILTER := @erp/backoffice-web
POS_FILTER := @erp/pos-web

.PHONY: help install openapi-generate dev build start build-shared-packages dev-api dev-backoffice dev-pos build-api build-backoffice build-pos start-api start-backoffice start-pos dev-all build-all start-all seed-inventory seed-dev-admin

help:
	@echo "ERP workspace make targets"
	@echo ""
	@echo "General:"
	@echo "  make install                    Install workspace dependencies"
	@echo "  make dev SERVICE=<name>         Run one service in dev mode (api|backoffice|pos)"
	@echo "  make build SERVICE=<name>       Build one service (api|backoffice|pos)"
	@echo "  make start SERVICE=<name>       Start one service (api|backoffice|pos)"
	@echo ""
	@echo "Direct service shortcuts:"
	@echo "  make dev-api | dev-backoffice | dev-pos"
	@echo "  make build-api | build-backoffice | build-pos"
	@echo "  make start-api | start-backoffice | start-pos"
	@echo ""
	@echo "Batch:"
	@echo "  make dev-all                    Print commands to start all dev servers"
	@echo "  make build-all                  Build api, backoffice, pos"
	@echo "  make start-all                  Start api + preview backoffice/pos"
	@echo ""
	@echo "Data:"
	@echo "  make seed-inventory             Seed demo org, admin user, branch, inventory (same as seed-dev-admin)"
	@echo "  make seed-dev-admin             Alias for seed-inventory (dev login + tenant data)"
	@echo ""
	@echo "Contracts:"
	@echo "  make openapi-generate           Fetch /docs-json from API and regenerate @erp/api-client types"

install:
	$(PNPM) install

build-shared-packages:
	$(PNPM) run build:shared

openapi-generate:
	$(PNPM) openapi:generate

dev:
	@if [ -z "$(SERVICE)" ]; then echo "Usage: make dev SERVICE=api|backoffice|pos"; exit 1; fi
	@if [ "$(SERVICE)" = "api" ]; then $(MAKE) dev-api; \
	elif [ "$(SERVICE)" = "backoffice" ]; then $(MAKE) dev-backoffice; \
	elif [ "$(SERVICE)" = "pos" ]; then $(MAKE) dev-pos; \
	else echo "Unknown SERVICE=$(SERVICE). Use api|backoffice|pos"; exit 1; fi

build:
	@if [ -z "$(SERVICE)" ]; then echo "Usage: make build SERVICE=api|backoffice|pos"; exit 1; fi
	@if [ "$(SERVICE)" = "api" ]; then $(MAKE) build-api; \
	elif [ "$(SERVICE)" = "backoffice" ]; then $(MAKE) build-backoffice; \
	elif [ "$(SERVICE)" = "pos" ]; then $(MAKE) build-pos; \
	else echo "Unknown SERVICE=$(SERVICE). Use api|backoffice|pos"; exit 1; fi

start:
	@if [ -z "$(SERVICE)" ]; then echo "Usage: make start SERVICE=api|backoffice|pos"; exit 1; fi
	@if [ "$(SERVICE)" = "api" ]; then $(MAKE) start-api; \
	elif [ "$(SERVICE)" = "backoffice" ]; then $(MAKE) start-backoffice; \
	elif [ "$(SERVICE)" = "pos" ]; then $(MAKE) start-pos; \
	else echo "Unknown SERVICE=$(SERVICE). Use api|backoffice|pos"; exit 1; fi

dev-api: build-shared-packages
	$(PNPM) --filter $(API_FILTER) dev

dev-backoffice:
	$(PNPM) --filter $(BACKOFFICE_FILTER) dev

dev-pos:
	$(PNPM) --filter $(POS_FILTER) dev

build-api: build-shared-packages
	$(PNPM) --filter $(API_FILTER) build

build-backoffice:
	$(PNPM) --filter $(BACKOFFICE_FILTER) build

build-pos:
	$(PNPM) --filter $(POS_FILTER) build

start-api:
	$(PNPM) --filter $(API_FILTER) start

start-backoffice:
	$(PNPM) --filter $(BACKOFFICE_FILTER) preview

start-pos:
	$(PNPM) --filter $(POS_FILTER) preview

dev-all:
	@echo "Start these in separate terminals:"
	@echo "  make dev-api"
	@echo "  make dev-backoffice"
	@echo "  make dev-pos"

build-all: build-api build-backoffice build-pos

start-all:
	@echo "Start these in separate terminals:"
	@echo "  make start-api"
	@echo "  make start-backoffice"
	@echo "  make start-pos"

seed-inventory:
	$(PNPM) --filter $(API_FILTER) seed:inventory

seed-dev-admin:
	$(PNPM) --filter $(API_FILTER) seed:dev-admin

seed-report-admin:
	$(PNPM) --filter $(API_FILTER) seed:report-types
