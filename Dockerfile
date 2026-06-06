# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev \
	&& test -x node_modules/.bin/ng

FROM deps AS build

COPY angular.json ./
COPY tsconfig*.json ./
COPY src ./src
COPY scripts/precompute-tierlist.js scripts/tierlist-calculation-engine.js scripts/compress-images.js ./scripts/

ARG BUILD_SCRIPT=build:prod
ARG FRONTEND_CONFIG_FINGERPRINT=local
RUN printf '%s' "${FRONTEND_CONFIG_FINGERPRINT}" > /tmp/frontend-config-fingerprint && npm run ${BUILD_SCRIPT}

FROM alpine:3.20 AS shell-files

WORKDIR /var/www/html/umamoe

ARG APP_BUILD_VERSION=local
ARG APP_BUILD_COMMIT=local
ARG APP_BUILD_ENVIRONMENT=local
ARG APP_BUILD_TIME=

COPY --from=build /app/dist/browser/ ./
RUN set -eu; \
	rm -rf assets; \
	build_time="${APP_BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"; \
	printf '{\n  "version": "%s",\n  "commit": "%s",\n  "environment": "%s",\n  "builtAt": "%s"\n}\n' \
		"$APP_BUILD_VERSION" \
		"$APP_BUILD_COMMIT" \
		"$APP_BUILD_ENVIRONMENT" \
		"$build_time" > version.json; \
	sed -i "s|<meta name=\"app-build-version\" content=\"[^\"]*\">|<meta name=\"app-build-version\" content=\"$APP_BUILD_VERSION\">|" index.html

FROM scratch AS shell

COPY --from=shell-files /var/www/html/umamoe/ /var/www/html/umamoe/

FROM scratch AS assets

COPY --from=build /app/dist/browser/assets/ /assets/
