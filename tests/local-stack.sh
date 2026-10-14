#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_dir=$(mktemp -d)
trap 'rm -f "$test_dir/bin/docker" "$test_dir/docker.log" "$test_dir/output" "$test_dir/local.sh" "$test_dir/.env.stack.local.example" "$test_dir/.env.stack.local" "$test_dir/.tmp/local-stack/simulator.key"; rmdir "$test_dir/.tmp/local-stack" "$test_dir/.tmp" "$test_dir/bin" "$test_dir" 2>/dev/null || true' EXIT
mkdir "$test_dir/bin"
cp "$project_dir/local.sh" "$project_dir/.env.stack.local.example" "$test_dir/"
export DOCKER_LOG="$test_dir/docker.log"
cat > "$test_dir/bin/docker" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$DOCKER_LOG"
if [ "$1" = info ] && [ "${MOCK_ENGINE:-on}" = off ]; then exit 1; fi
SH
chmod +x "$test_dir/bin/docker"
export PATH="$test_dir/bin:$PATH"

fail() { echo "$1" >&2; exit 1; }

# Offline configuration must not require a daemon or start services.
MOCK_ENGINE=off sh "$test_dir/local.sh" config > "$test_dir/output"
case "$(cat "$DOCKER_LOG")" in *'info'*|*' up '*) fail 'config attempted to use the Docker daemon' ;; esac
[ -s "$test_dir/.tmp/local-stack/simulator.key" ] || fail 'local key was not generated'
key_before=$(cat "$test_dir/.tmp/local-stack/simulator.key")
printf '\n# preserved setting\n' >> "$test_dir/.env.stack.local"

# Full-app startup must build, wait for readiness, and retain local settings.
: > "$DOCKER_LOG"
sh "$test_dir/local.sh" --app up > "$test_dir/output"
case "$(cat "$DOCKER_LOG")" in *'--profile app up --build --detach --wait --wait-timeout 900'*) ;; *) fail 'full-app startup did not build and wait' ;; esac
[ "$key_before" = "$(cat "$test_dir/.tmp/local-stack/simulator.key")" ] || fail 'existing key was replaced'
case "$(cat "$test_dir/.env.stack.local")" in *'# preserved setting'*) ;; *) fail 'local settings were replaced' ;; esac

# A stopped engine must fail before any startup attempt.
: > "$DOCKER_LOG"
if MOCK_ENGINE=off sh "$test_dir/local.sh" up > "$test_dir/output" 2>&1; then fail 'startup accepted a stopped engine'; fi
case "$(cat "$DOCKER_LOG")" in *' up '*) fail 'startup ran despite a stopped engine' ;; esac

if sh "$test_dir/local.sh" erase > "$test_dir/output" 2>&1; then fail 'unknown command accepted'; fi
echo 'Local launcher checks passed.'
