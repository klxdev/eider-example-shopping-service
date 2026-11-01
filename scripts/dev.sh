#!/bin/sh
# Development: the Eider server and the Vite dev server, both rebuilding on change.
#
#   sh scripts/dev.sh      then open http://localhost:5173  (PORT=... moves the server off 8080)
#
# - The server (server/target/server, :8080) is rebuilt and restarted when a .ei file in
#   server/, shared/ or shared-wasm/ changes; a change in shared/ or shared-wasm/ also
#   rebuilds the WebAssembly module,
#   and a change in server/ regenerates the TypeScript client (Vite reloads the page).
#   eider has no watch mode (filed as klxdev/eider-lang#147), so this polls once a second.
# - Vite serves the page with hot reload on :5173 and the page calls the server directly
#   (VITE_API_BASE), which allows that origin with CORS.
# Ctrl-C stops both.
set -eu
. "$(dirname "$0")/env.sh"

sh "$ROOT/scripts/build.sh"
STAMP="$ROOT/server/target/.dev-stamp"
touch "$STAMP"
SERVER_PID=""
PORT=${PORT:-8080}

start_server() {
    (cd "$ROOT/server" && exec env SHOP_ADMIN_TOKEN=${SHOP_ADMIN_TOKEN:-dev} SHOP_CORS_ORIGIN=http://localhost:5173 ./target/server "$PORT") &
    SERVER_PID=$!
}
stop_server() {
    if [ -n "$SERVER_PID" ]; then kill -TERM "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
    SERVER_PID=""
}
cleanup() { stop_server; [ -n "${VITE_PID:-}" ] && kill "$VITE_PID" 2>/dev/null; exit 0; }
trap cleanup INT TERM

start_server
(cd "$ROOT/web" && exec env VITE_API_BASE=http://127.0.0.1:$PORT SHOP_SERVER=http://127.0.0.1:$PORT ./node_modules/.bin/vite) &
VITE_PID=$!

while true; do
    sleep 1
    shared=$(find "$ROOT/shared" "$ROOT/shared-wasm" -name '*.ei' -newer "$STAMP" | head -1)
    server=$(find "$ROOT/server" -name '*.ei' -not -path '*/target/*' -newer "$STAMP" | head -1)
    [ -z "$shared$server" ] && continue
    touch "$STAMP"
    echo "dev: ${shared:-$server} changed; rebuilding"
    if [ -n "$shared" ]; then
        (cd "$ROOT/shared-wasm" && eider build --wasm wasm.ei -o ../web/src/wasm/shared) || continue
    fi
    (cd "$ROOT/server" && eider build main.ei -o target/server) || continue
    (cd "$ROOT/web" && npm run --silent gen) || true
    stop_server
    start_server
done
