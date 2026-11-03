.PHONY: test build

test:
	npm ci
	npm test

build:
	npm ci
	npm run build
