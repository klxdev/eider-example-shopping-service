# Eider Shop: an example shopping service

A small shop with a catalog, carts, coupons, checkout and order history, written to show
[Eider](https://github.com/klxdev/eider-lang) for real service development. The backend is
all Eider. The shop's rules (money, cart totals, discounts, tax, stock and input checks) are
one Eider package that the server compiles natively and the web page loads as
WebAssembly, so the browser and the server compute the same totals and refuse the same
input with the same messages. The front end is a thin TypeScript layer over a client
generated from the server's `/openapi.json`.

It is built with the published Eider toolchain (0.2.0, `eider = "0.2"`) and the libraries
at their v0.2.0 tags: [eider-http](https://github.com/klxdev/eider-http),
[eider-openapi](https://github.com/klxdev/eider-openapi),
[eider-rpc](https://github.com/klxdev/eider-rpc) and
[eider-json](https://github.com/klxdev/eider-json). No eider-lang checkout is needed.

## Architecture

```text
                      shared/  (Eider, pure: no capabilities)
          money.ei  coupon.ei  cart.ei  validate.ei   shared.ei (ShopError)
                 |                                  |
     native (import shared.*)              eider build --wasm wasm.ei
                 |                                  |   + wire.ei (text in, JSON out)
                 v                                  v
  server/  (Eider)                         web/src/wasm/shared.wasm
    store.ei   carts, orders, stock               |
               behind one sync.Lock               |
    api.ei     REST + OpenAPI (eider-openapi)     |   web/  (TypeScript)
    admin.ei   JSON-RPC admin (eider-rpc)         +-> shop.ts   typed wrapper of the module
    assets.ei  serves web/dist                         main.ts   five views, plain DOM
    app.ei     middleware (eider-http)    <-- HTTP --  api/client.ts  openapi-fetch over
    main.ei    listen, SIGTERM drain                   api/schema.d.ts, generated from
                                                       `server --openapi`
```

One process serves everything: `server/target/server` answers the API under `/api`,
`/openapi.json`, `/rpc`, `/health`, `/metrics`, and the built page (`web/dist`) at `/`.

| Path | What |
|---|---|
| `GET /api/products`, `GET /api/products/{id}` | the catalog |
| `GET /api/coupons` | SAVE10 (10% off), TAKE5 ($5 off $25+), FREESHIP |
| `POST /api/carts`, `GET /api/carts/{id}` | a cart, with its totals from `shared/cart.ei` |
| `POST /api/carts/{id}/lines`, `PUT`/`DELETE /api/carts/{id}/lines/{product_id}` | add, set (0 removes), remove a line |
| `PUT`/`DELETE /api/carts/{id}/coupon` | apply or remove a coupon |
| `POST /api/carts/{id}/checkout` | checks stock, prices, takes the stock, records the order (201) |
| `GET /api/orders?email=`, `GET /api/orders/{id}` | order history |
| `GET /openapi.json` | the OpenAPI 3.1 description the routes are registered with |
| `POST /rpc` | JSON-RPC 2.0 admin API (bearer token): `admin.stats`, `admin.restock`, `admin.set_price` |
| `GET /health`, `GET /metrics` | liveness, Prometheus metrics |

The rules: quantities 1 to 10 per line, at most 20 products per cart, never more than the
stock; tax 8.25% on the subtotal after discounts; shipping $5.99, free from $50.00 after
discounts or with FREESHIP. Amounts are integer cents up to 2^53 - 1, so they are exact in
JSON and in JavaScript.

## What it shows of Eider

- **Capabilities.** `shared/` declares none, so nothing in it can touch files, the network
  or the clock, and its grant in `server/eider.toml` is empty. Each library is granted exactly
  what the program loads of it (`eider tree`, `eider caps server/main.ei`); the compiler
  holds them to it on every build (E0204). In the server only `assets.ei` uses `fs`, and
  only `main.ei` (and the e2e test) use `net` and `threads` directly.
- **Value semantics and `inout`.** A cart is a `List[Item]`; `cart.add(inout items, ...)`
  changes the caller's list in place and only where the call says `inout`, and a refused
  change leaves it as it was (`shared/cart.ei`, tested in `shared/tests/cart_test.ei`).
  Records returned by the store are copies: changing one changes nothing shared.
- **Result and `?`, with `From`.** No exceptions: every rule returns
  `Result[_, shared.ShopError]`; `?` converts money errors into shop errors and shop errors
  into store errors through `From` impls (`shared/shared.ei`, `server/store.ei`). Errors have
  stable codes and messages, used by problem+json, the JSON-RPC errors and the web page.
- **No silent overflow.** Arithmetic traps on overflow in Eider, and a trap ends a service,
  so `shared/money.ei` checks before it multiplies; a hostile quantity or price is a 422,
  not a crash (tested natively and through WebAssembly).
- **`sync.Lock` and `Lock.modify`.** The store is one `Lock[Db]`; each operation is one
  critical section. Checkout checks every line's stock, prices the cart and takes the stock
  in the same section, so four shoppers racing for the last two pins get exactly two orders
  (`server/tests/e2e_test.ei`).
- **Typed OpenAPI.** Each route is registered with its operation (`server/api.ei`): that one
  value is the router pattern, the request validation (400 problem+json listing every wrong
  member, 413, 415) and the served `/openapi.json`. The schemas' bounds are the shared
  package's constants (`validate.MAX_QTY`, `money.MAX_CENTS`), and the TypeScript client's
  types are generated from the same document, so the page, the description and the checks
  can't drift apart.
- **Sharing code through WebAssembly.** `eider build --wasm shared/wasm.ei` compiles the
  same modules the server imports. The page checks quantities against stock, validates the
  checkout form, looks up coupons and computes the cart's totals in the browser, and shows
  that they match the server's.
- **JSON-RPC, middleware, operations.** eider-rpc's method table for the admin API;
  eider-http's request ids, JSON access log, metrics, problem+json for its own 404/405, CORS
  for the dev server, bearer auth; graceful shutdown on SIGTERM/SIGINT.
- **Tests in Eider.** `test` blocks for the rules, the store and the API's encoders, and an
  end-to-end test of the whole service over loopback on an ephemeral port with no sleeps.

### The WebAssembly boundary today

In Eider 0.2 an `export fn` takes and returns only integers and `bool`, and a module keeps
no state between calls. So the module has two kinds of export (`shared/wasm.ei`):

- integer functions called directly: `line_total_cents(1299, 2)`, `check_qty(id, qty, stock)`,
  the shop's constants; a negative result is minus an error code;
- buffer functions for text and lists (`quote`, `check_customer`, `find_coupon`,
  `format_cents`): the request is `<key> <value>` lines (`line 1 1299 2`, `coupon TAKE5`)
  that the module reads through two imported host functions, `host_input_len()` and
  `host_input_byte(i)`, and the answer is JSON text written with `print`
  (`shared/wire.ei`, tested natively in `shared/tests/wire_test.ei`).

`web/src/shop.ts` wraps both in typed functions. It instantiates the module itself, using
the generated `shared.d.ts` for the export types, because the generated loader doesn't let
the page read what the module prints. When typed exports land
([eider-lang#136](https://github.com/klxdev/eider-lang/issues/136)), `wire.ei` and most of
`shop.ts` go away. Spots that will simplify as the language grows are marked
`// TODO(<repo>#<n>)` in the code.

## Running it

Requirements: `eider` with the 0.2 toolchain (from eider-lang's latest release:
`sh install.sh --toolchain`), clang 17+ with the wasm32 target and `wasm-ld`, Node 20.19+,
and a GitHub token with access to the klxdev repositories (`GH_TOKEN`, or `gh auth login`).

```sh
sh scripts/build.sh          # fetch, shared -> wasm, server, client generation, web/dist
cd server && ./target/server # http://127.0.0.1:8080 (PORT or an argument changes it)
```

`SHOP_ADMIN_TOKEN` sets the admin API's token (else a random one is printed):

```sh
curl -s localhost:8080/rpc -H "Authorization: Bearer $SHOP_ADMIN_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"admin.restock","params":{"product_id":6,"qty":5},"id":1}'
```

Development, with both sides rebuilding on change:

```sh
sh scripts/dev.sh            # Vite on http://localhost:5173, the server on :8080 (PORT=...)
```

A change to a `.ei` file in `server/` or `shared/` rebuilds and restarts the server (and
rebuilds the wasm module and the generated client); Vite reloads the page. The page calls
the server directly, which allows the dev origin with CORS.

## Tests

```sh
sh scripts/test.sh           # build, then everything below
```

| What | Where | Runs with |
|---|---|---|
| money, cart, coupons, validation, the wire protocol | `shared/tests/*_test.ei` | `eider test` |
| the store (carts, checkout atomicity, admin), API errors and encoders, static paths | `server/tests/{store,api}_test.ei` | `eider test` |
| the whole service over loopback: 50 checks | `server/tests/e2e_test.ei` | `eider run` |
| the wasm module from TypeScript, the client | `web/src/**/*.test.ts` | vitest |
| a purchase in a browser | `web/e2e/purchase.spec.ts` | Playwright (Chromium) |

### End-to-end test in a browser

The Playwright test starts `server/target/server` on port 4173 serving `web/dist`, then
browses, adds to the cart (the wasm module refuses more than the stock), checks the totals
and that the browser's agree with the server's, applies a coupon, checks out through
validation, and checks the confirmation, the history and the stock.

It needs Chromium for Playwright 1.63 (`cd web && npx playwright install chromium`) and its
system libraries (`npx playwright install-deps chromium`, which needs root). Where the
browser is missing or can't start, the test is skipped and says why. On a host where the
libraries can't be installed system-wide (Fedora Atomic, for example), unpack them
somewhere and point `LD_LIBRARY_PATH` at them:

```sh
mkdir -p ~/chromium-libs && cd ~/chromium-libs
dnf download --arch x86_64 atk at-spi2-atk at-spi2-core libXcomposite libXdamage libXfixes \
    libXrandr libXi libXtst libxkbcommon libxshmfence mesa-libgbm alsa-lib
for r in *.rpm; do rpm2cpio "$r" | cpio -idm; done
LD_LIBRARY_PATH=~/chromium-libs/usr/lib64 sh scripts/test.sh
```

## Layout

```text
shared/      the shop's rules (Eider package `shared`), wasm.ei: the WebAssembly entry
server/      the service (Eider package `server`), tests/: unit and end-to-end tests
web/         the front end: src/main.ts, src/shop.ts, src/api/ (generated types + client),
             scripts/gen-api.mjs, e2e/ (Playwright)
scripts/     build.sh, test.sh, dev.sh, env.sh (toolchain and git credentials for fetches)
```

Generated files (`web/src/wasm/`, `web/src/api/schema.d.ts`, `web/dist/`,
`server/target/`) are not committed; `scripts/build.sh` makes them.

## Gaps found in Eider

Filed while building this, and marked in the code with `TODO(<repo>#<n>)`:

| Issue | What |
|---|---|
| [eider-lang#136](https://github.com/klxdev/eider-lang/issues/136) | WebAssembly exports: Strings, Lists and records across the boundary |
| [eider-lang#137](https://github.com/klxdev/eider-lang/issues/137) | `--wasm` modules that use core.sys's text helpers import unresolved `ec_*` functions |
| [eider-lang#138](https://github.com/klxdev/eider-lang/issues/138) | The wasm loader keeps memory private, so an `eider_write` override can't read the text |
| [eider-lang#139](https://github.com/klxdev/eider-lang/issues/139) | Host imports (`extern` in `--wasm` modules): document and type them |
| [eider-lang#140](https://github.com/klxdev/eider-lang/issues/140) | `eider test` and `eider check` for a library module without `main` |
| [eider-lang#141](https://github.com/klxdev/eider-lang/issues/141) | eider-pkg's grant check sees only the entry module, one capability at a time |
| [eider-lang#142](https://github.com/klxdev/eider-lang/issues/142) | eider-pkg: authenticate private git dependencies with GH_TOKEN |
| [eider-lang#143](https://github.com/klxdev/eider-lang/issues/143) | Infer a match arm's type from its sibling arms |
| [eider-lang#144](https://github.com/klxdev/eider-lang/issues/144) | Checked integer arithmetic returning Option |
| [eider-lang#145](https://github.com/klxdev/eider-lang/issues/145) | A receiver's own method call in an argument of its `inout` call (E0301) |
| [eider-lang#146](https://github.com/klxdev/eider-lang/issues/146) | Continue a method chain on the next line |
| [eider-lang#147](https://github.com/klxdev/eider-lang/issues/147) | `eider run --watch` |
| [eider-http#7](https://github.com/klxdev/eider-http/issues/7) | A static-file handler |
| [eider-rpc#2](https://github.com/klxdev/eider-rpc/issues/2) | Serving JSON-RPC shouldn't need a `net, io, clock` grant |
| [eider-openapi#3](https://github.com/klxdev/eider-openapi/issues/3) | String accessors on `openapi.Input` |

Already tracked, and waited on here: string interpolation (eider-lang#17), defer (#15),
pattern-matching finish (#105), `let ... else` (#106), List literals (#49), `if` as an
argument (#48), computed `assert`/`panic` messages (#47), a SIGTERM helper (#24), grants per
imported module (#60), and JSON derive (eider-json#1, eider-openapi#1).

## Versions

`VERSION` holds this example's version; [CHANGELOG.md](CHANGELOG.md) lists the changes.
