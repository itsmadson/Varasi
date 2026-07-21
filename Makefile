.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up down restart logs ps health seed bucket ingest clean

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n",$$1,$$2}'

env: ## Create .env from example if missing
	@test -f .env || cp .env.example .env && echo ".env ready"

up: env ## Start infra + catalog stack
	$(COMPOSE) up -d
	@echo "STAC:    http://localhost:8081"
	@echo "Raster:  http://localhost:8082"
	@echo "Vector:  http://localhost:8083"
	@echo "MinIO:   http://localhost:9001"

down: ## Stop stack
	$(COMPOSE) down

restart: down up ## Restart stack

logs: ## Tail logs
	$(COMPOSE) logs -f

ps: ## Service status
	$(COMPOSE) ps

health: ## Wait for core services healthy
	@bash scripts/wait_healthy.sh

bucket: ## Create MinIO derived bucket
	@bash scripts/init_minio.sh

build-ingest: ## Build the ingest worker image
	$(COMPOSE) --profile tools build ingest

seed: ## Ingest sample public COGs into catalog
	$(COMPOSE) --profile tools run --rm ingest seed

ingest: ## Ingest a source: make ingest SRC=<uri> COLLECTION=<id>
	$(COMPOSE) --profile tools run --rm ingest ingest --uri "$(SRC)" --collection "$(COLLECTION)"

clean: ## Stop and wipe volumes
	$(COMPOSE) down -v
