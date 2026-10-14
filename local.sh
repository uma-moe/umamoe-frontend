#!/bin/sh
set -eu

stack_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$stack_dir"

app=false
if [ "${1:-}" = --app ]; then
  app=true
  shift
fi
action=${1:-up}
if [ "$#" -gt 0 ]; then shift; fi
if [ "$#" -gt 0 ]; then
  echo 'Usage: sh local.sh [--app] [up|build|down|logs|ps|config]' >&2
  exit 2
fi
case "$action" in
  up|build|down|logs|ps|config) ;;
  *) echo 'Usage: sh local.sh [--app] [up|build|down|logs|ps|config]' >&2; exit 2 ;;
esac

command -v docker >/dev/null 2>&1 || { echo 'Docker with Compose is required.' >&2; exit 1; }
docker compose version >/dev/null

if [ ! -f .env.stack.local ]; then
  cp .env.stack.local.example .env.stack.local
  echo 'Created .env.stack.local; existing development settings were left untouched.'
fi
mkdir -p .tmp/local-stack
chmod 700 .tmp/local-stack
if [ ! -s .tmp/local-stack/simulator.key ]; then
  command -v openssl >/dev/null 2>&1 || { echo 'OpenSSL is required to create the local simulator key.' >&2; exit 1; }
  key_material=$(openssl rand -hex 24)
  (umask 077; printf 'uma_k_%s\n' "$key_material" > .tmp/local-stack/simulator.key)
  # Compose bind-mounts file secrets; the non-root backend must read this local-only key.
  chmod 644 .tmp/local-stack/simulator.key
fi

compose() {
  if [ "$app" = true ]; then
    docker compose --env-file .env.stack.local -f compose.local.yaml --profile app "$@"
  else
    docker compose --env-file .env.stack.local -f compose.local.yaml "$@"
  fi
}

compose config --quiet
if [ "$action" = config ]; then
  echo 'Local Compose configuration is valid.'
  exit 0
fi
docker info >/dev/null 2>&1 || { echo 'Start Docker Desktop or Docker Engine, then run this command again.' >&2; exit 1; }

case "$action" in
  up)
    compose up --build --detach --wait --wait-timeout 900
    compose ps
    ;;
  build) compose build ;;
  down) compose down ;;
  logs) compose logs --follow --tail 100 ;;
  ps) compose ps ;;
esac
