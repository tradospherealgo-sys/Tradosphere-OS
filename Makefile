.PHONY: up down install build test lint

up:
	docker compose up -d

down:
	docker compose down

install:
	pnpm install

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint
