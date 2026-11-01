#!/bin/sh
# Builds, then runs every test:
#   shared/tests/*_test.ei     the domain rules (eider test)
#   server/tests/*_test.ei     the store, the API's errors and encoders, static paths
#   server/tests/e2e_test.ei   the whole service over loopback (eider run)
#   web                        tsc, vitest (the wasm module and the client), Playwright
# Exits non-zero when anything fails. SKIP_BUILD=1 skips the build; SKIP_E2E_BROWSER=1
# skips Playwright.
set -eu
. "$(dirname "$0")/env.sh"

[ "${SKIP_BUILD:-}" = 1 ] || sh "$ROOT/scripts/build.sh"

step "shared: eider test"
cd "$ROOT/shared"
for t in tests/*_test.ei; do echo "-- $t"; eider test "$t"; done

step "server: eider test"
cd "$ROOT/server"
for t in tests/store_test.ei tests/api_test.ei; do echo "-- $t"; eider test "$t"; done

step "server: end to end over loopback"
eider run tests/e2e_test.ei

step "web: typecheck and unit tests"
cd "$ROOT/web"
npm run --silent typecheck
npm test --silent

if [ "${SKIP_E2E_BROWSER:-}" = 1 ]; then
    step "web: Playwright skipped (SKIP_E2E_BROWSER=1)"
else
    step "web: Playwright (Chromium) against server/target/server"
    npx playwright test
fi

step "all tests passed"
