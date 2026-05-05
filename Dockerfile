# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY angular.json ./
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts

ARG BUILD_SCRIPT=build:prod
RUN npm run ${BUILD_SCRIPT}

FROM alpine:3.20 AS shell-files

WORKDIR /var/www/html/umamoe

COPY --from=build /app/dist/browser/ ./
RUN rm -rf assets

FROM scratch AS shell

COPY --from=shell-files /var/www/html/umamoe/ /var/www/html/umamoe/

FROM scratch AS assets

COPY --from=build /app/dist/browser/assets/ /assets/