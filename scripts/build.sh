#!/bin/sh
# Builds everything, in dependency order:
#   1. the Eider packages' dependencies (eider fetch, as eider.lock pins them)
#   2. shared/wasm.ei -> web/src/wasm/shared.{wasm,js,d.ts}   (eider build --wasm)
#   3. server/main.ei -> server/target/server                 (eider build)
#   4. the TypeScript client from the server's OpenAPI description (web: npm run gen)
#   5. the front end -> web/dist                              (tsc, vite build)
# Then `server/target/server` serves the API and the page on http://127.0.0.1:8080.
set -eu
. "$(dirname "$0")/env.sh"

step "eider toolchain"
(cd "$ROOT/server" && eider toolchain show)

step "eider fetch"
(cd "$ROOT/shared" && eider fetch)
(cd "$ROOT/server" && eider fetch)

step "shared -> WebAssembly"
mkdir -p "$ROOT/web/src/wasm"
(cd "$ROOT/shared" && eider build --wasm wasm.ei -o ../web/src/wasm/shared)

step "server"
mkdir -p "$ROOT/server/target"
(cd "$ROOT/server" && eider build main.ei -o target/server)

step "web"
cd "$ROOT/web"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run --silent gen
npm run --silent build
echo
echo "built: server/target/server (serves web/dist): cd server && ./target/server"
