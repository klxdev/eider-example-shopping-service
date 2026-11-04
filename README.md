# Eider Shop: an example shopping service

A small shop with a catalog, carts, coupons, checkout and order history, written to show
[Eider](https://github.com/klxdev/eider-lang) for real service development. The backend is
all Eider. The shop's rules (money, cart totals, discounts, tax, stock and input checks) are
one Eider package that the server compiles natively and the web page loads as
WebAssembly, so the browser and the server compute the same totals and refuse the same
input with the same messages. The front end is a thin TypeScript layer over a client
generated from the server's `/openapi.json`.

It is built with the published Eider toolchain (0.6.0, `eider = "0.6"`) and the libraries
at their v0.6.0 tags: [eider-http](https://github.com/klxdev/eider-http),
[eider-openapi](https://github.com/klxdev/eider-openapi),
[eider-rpc](https://github.com/klxdev/eider-rpc) and
[eider-json](https://github.com/klxdev/eider-json). No eider-lang checkout is needed.

## Architecture

```text
                      shared/  (Eider, pure: no capabilities)
          money.ei  coupon.ei  cart.ei  validate.ei   shared.ei (ShopError)
                 |                                  |
     native (import shared.*)              shared-wasm/  (pure)
                 |                         eider build --wasm wasm.ei
                 |                                  |   + wire.ei (String in, JSON String out)
                 v                                  v
  server/  (Eider)                         web/src/wasm/shared.wasm
    store.ei   carts, orders, stock               |
               behind one sync.Lock               |
    api.ei     REST + OpenAPI (eider-openapi)     |   web/  (TypeScript)
    admin.ei   JSON-RPC admin (eider-rpc)         +-> shop.ts   typed wrapper of the module
    assets.ei  serves web/dist                         main.ts   five views, plain DOM
    app.ei     middleware (eider-http)    <-- HTTP --  api/client.ts  openapi-fetch over
    main.ei    std/config, std/log, std/service                   api/schema.d.ts, generated from
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
  or the clock, and its grant in `server/eider.toml` is empty. The WebAssembly entry is a
  package of its own (`shared-wasm/`, also pure) so the server doesn't build the wire
  format, and a dependency's grant covers every module of it. Each library is granted what its modules use
  (`eider tree`; `eider fetch` computes it and asks again when it grows); the compiler holds
  them to it on every build (E0204). In the server only `assets.ei` uses `fs`, and
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
- **OpenAPI from the types.** Each route is registered with its operation (`server/api.ei`): that
  one value is the router pattern, the request validation (400 problem+json listing every wrong
  member, 413, 415) and the served `/openapi.json`. The handlers are plain functions over
  records: `openapi.json_body_with` reads the body into an `AddIn`, `QtyIn`, ... and writes the
  answer, `openapi.json_out` writes the answer of a route without a body, both through
  eider-json's derived codecs. The schemas are `T.json_schema()` (eider-openapi's derived `Schematic`), and the bounds are
  `@[check(...)]` on the record fields (`min`, `max`, `min_len`, `max_len`, `format = "email"`
  from `std/validate`): the derived decoder enforces them, the schema states them, and a wrong
  field is a 400 with its pointer, from the one attribute. What a type can't state stays code:
  `Money`'s range (its own schema), the path parameters, and the rules in `shared/validate.ei`
  that clean or judge a value (trimming, the domain of the address, control characters in a
  name), which answer 422 behind the 400. The TypeScript client's types are generated from the same
  document, so the page, the description and the checks can't drift apart, and the tests run
  every response through `openapi.check_response` against its operation.
- **Opt-in serialization.** Records say `@[derive(Serialize)]` (responses) or
  `@[derive(Serialize, Deserialize)]` (request bodies, admin parameters), and eider-json writes
  and reads them (`json.to_bytes`/`json.to_string`, `json.from_bytes`) through `std/serial`:
  the API's responses, the admin API's parameters and results, the request bodies and the
  WebAssembly module's answers (`shared-wasm/wire.ei`) come from the records' fields by
  comptime reflection, and a field with no impl is a compile error with its path.
  `@[serial(name = "price_cents")]`, `@[json(flatten)]` (an order's customer, the `ok` of a wire
  reply) and `@[serial(skip)]` shape them; `Money` is a bare number of cents through a per-field adapter,
  `@[serial(with = money)]` (`shared/money.ei`'s `serialize`/`deserialize`, which read through the
  range check), with its schema beside the API's in `server/api.ei`.
- **Sharing code through WebAssembly.** `eider build --wasm shared-wasm/wasm.ei` compiles the
  same modules the server imports. The page checks quantities against stock, validates the
  checkout form, looks up coupons and computes the cart's totals in the browser, and shows
  that they match the server's.
- **A service's basics from std.** `std/config` layers defaults, `SHOP_*` variables and
  `--flags` (a flag the defaults don't name is an error); `std/log` writes the startup and
  shutdown lines as JSON; `std/service.cancel_on_term` drains on SIGTERM/SIGINT; `main`
  returns `Result[(), String]`, so a bad setting or a port in use ends the process with
  `error: ...` and status 1 (`server/main.ei`).
- **JSON-RPC, middleware, operations.** eider-rpc's `rpc/service` for the admin API (`add_json`
  methods over records, mounted as `admin.*`); eider-http's request ids, W3C trace spans
  (`trace.wrap`, written through the service's logger), the access log through the same
  `std/log` Logger (`access_log_with`), per-route metrics (`by_route`, labelled by operation
  id), problem+json for its own 404/405, CORS for the dev server, bearer auth.
- **Tests in Eider.** `test` blocks for the rules, the store, the API's encoders and the wasm
  module's answers (no `main` needed in a test file), and an end-to-end test of the whole
  service over loopback on an ephemeral port with no sleeps.

### The WebAssembly boundary today

In Eider 0.5 an `export fn` takes and returns integers, `bool`, `String` (a JavaScript
`string`) and `List[u8]` (a `Uint8Array`), but not yet records or other lists. So the module
has two kinds of export (`shared-wasm/wasm.ei`):

- integer functions called directly: `line_total_cents(1299, 2)` and the shop's constants; a
  negative result is minus an error code;
- text functions, `String -> String`: `quote`, `check_customer`, `find_coupon`, `check_qty`
  and `format_cents`. The request is `<key> <value>` lines (`line 1 1299 2`, `coupon TAKE5`,
  `product 1` / `qty 3` / `stock 5`), the answer is JSON that eider-json writes from derived
  types (`Reply[T]`, `Failure`, `ErrorInfo`, `coupon.Info`, `cart.Quote`;
  `shared-wasm/wire.ei`, tested natively in `shared-wasm/tests/wire_test.ei`).

`web/src/shop.ts` wraps them in typed functions over the generated loader (`shared.js`,
`shared.d.ts`): about 90 lines, with no hand-written instantiation, input buffer or output
capture. When records can cross ([typescript_models](https://github.com/klxdev/eider-lang/blob/main/docs/design/typescript_models.md)),
the line format and the JSON parsing go away too. Spots that will simplify as the language
grows are marked `// TODO(<repo>#<n>)` in the code.

## Running it

Requirements: `eider` with the 0.6 toolchain (from eider-lang's latest release:
`sh install.sh --toolchain`), clang 17+ with the wasm32 target and `wasm-ld`, Node 20.19+,
and a GitHub token with access to the klxdev repositories (`GH_TOKEN`, or `gh auth login`).

```sh
sh scripts/build.sh          # fetch, shared -> wasm, server, client generation, web/dist
cd server && ./target/server # http://127.0.0.1:8080 (--port=N or SHOP_PORT changes it)
```

Settings are `--port`, `--admin.token`, `--web.dir` and `--cors.origin`, or `SHOP_PORT`,
`SHOP_ADMIN_TOKEN`, `SHOP_WEB_DIR` and `SHOP_CORS_ORIGIN` (flags win). Without an admin token a
random one is logged at startup:

```sh
curl -s localhost:8080/rpc -H "Authorization: Bearer $SHOP_ADMIN_TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"admin.restock","params":{"product_id":6,"qty":5},"id":1}'
```

Development, with both sides rebuilding on change:

```sh
sh scripts/dev.sh            # Vite on http://localhost:5173, the server on :8080 (PORT=... moves it)
```

A change to a `.ei` file in `server/`, `shared/` or `shared-wasm/` rebuilds and restarts the server (and
rebuilds the wasm module and the generated client); Vite reloads the page. The page calls
the server directly, which allows the dev origin with CORS.

## Tests

```sh
sh scripts/test.sh           # build, then everything below
```

| What | Where | Runs with |
|---|---|---|
| lints: `[lints] all = "deny"` in each `eider.toml` | `server` (all modules, via `main.ei`; the e2e test), `shared-wasm` | `eider lint` |
| money, cart, coupons, validation | `shared/tests/*_test.ei` | `eider test` |
| the wasm module's requests and answers | `shared-wasm/tests/*_test.ei` | `eider test` |
| the store (carts, checkout atomicity, admin); the API in process (`http/testing`, every response checked against its operation), errors, encoders, static paths | `server/tests/{store,api}_test.ei` | `eider test` |
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
shared/      the shop's rules (Eider package `shared`), pure
shared-wasm/ the WebAssembly module (package `shared_wasm`): wasm.ei, the exports; wire.ei, requests and answers
server/      the service (Eider package `server`), tests/: unit and end-to-end tests
web/         the front end: src/main.ts, src/shop.ts, src/api/ (generated types + client),
             scripts/gen-api.mjs, e2e/ (Playwright)
scripts/     build.sh, test.sh, dev.sh, env.sh (toolchain and git credentials for fetches)
```

Generated files (`web/src/wasm/`, `web/src/api/schema.d.ts`, `web/dist/`,
`server/target/`) are not committed; `scripts/build.sh` makes them.

## Gaps found in Eider

Filed while building this, and marked in the code with `TODO(<repo>#<n>)` while they are
open. Closed ones were fixed in Eider 0.4 or 0.5 and the code uses the fix.

| Issue | What | State |
|---|---|---|
| [eider-lang#136](https://github.com/klxdev/eider-lang/issues/136) | WebAssembly exports: Strings, Lists and records across the boundary | closed (Strings and `List[u8]` in 0.4) |
| [eider-lang#137](https://github.com/klxdev/eider-lang/issues/137) | `--wasm` modules that use core.sys's text helpers import unresolved `ec_*` functions | closed |
| [eider-lang#138](https://github.com/klxdev/eider-lang/issues/138) | The wasm loader keeps memory private, so an `eider_write` override can't read the text | closed |
| [eider-lang#139](https://github.com/klxdev/eider-lang/issues/139) | Host imports (`extern` in `--wasm` modules): document and type them | open, not needed here any more |
| [eider-lang#140](https://github.com/klxdev/eider-lang/issues/140) | `eider test` and `eider check` for a library module without `main` | closed |
| [eider-lang#143](https://github.com/klxdev/eider-lang/issues/143) | Infer a match arm's type from its sibling arms | open |
| [eider-lang#144](https://github.com/klxdev/eider-lang/issues/144) | Checked integer arithmetic returning Option | open |
| [eider-lang#145](https://github.com/klxdev/eider-lang/issues/145) | A receiver's own method call in an argument of its `inout` call (E0301) | open |
| [eider-lang#146](https://github.com/klxdev/eider-lang/issues/146) | Continue a method chain on the next line | closed (not planned) |
| [eider-lang#147](https://github.com/klxdev/eider-lang/issues/147) | `eider run --watch` | open |
| [eider-lang#149](https://github.com/klxdev/eider-lang/issues/149) | Explicit type arguments in calls (`json.from_json[T](x)`), inferring a generic result through `?` | open, not needed here any more (`openapi.json_body`) |
| [eider-lang#162](https://github.com/klxdev/eider-lang/issues/162) | Errors in a test file without `main` are reported against another file | open |
| [eider-lang#163](https://github.com/klxdev/eider-lang/issues/163) | `eider lint` for a library module or package without `main` | open (`shared` can't be linted, and the test files without a `main`; the rest is, clean) |
| [eider-http#7](https://github.com/klxdev/eider-http/issues/7) | A static-file handler | open |
| [eider-http#8](https://github.com/klxdev/eider-http/issues/8) | `access_log` should write through a `std/log` Logger | closed (`access_log_with`, 0.5) |
| [eider-json#2](https://github.com/klxdev/eider-json/issues/2) | `to_string`/`from_string`: JSON as String, not List[u8] | closed (0.5) |
| [eider-rpc#2](https://github.com/klxdev/eider-rpc/issues/2) | Serving JSON-RPC shouldn't need a `net, io, clock` grant | open |
| [eider-openapi#3](https://github.com/klxdev/eider-openapi/issues/3) | String accessors on `openapi.Input` | open (`query_text` and `path_text` shipped in 0.5 and are used) |

Already tracked, and waited on here: embedding the built front end in the binary (`comptime embed` takes text only, eider-lang#160; see CHANGELOG), `let ... else` (#106), List literals (#49), `if` as an
argument (#48), computed `assert`/`panic` messages (#47), grants per imported module (#60),
and attributes for the schema bounds a type can't state (eider-lang#101). Eider 0.5 brought derived schemas and typed handlers (eider-openapi#1), `json.to_string`, `access_log_with`, tracing and per-route metrics, `http/testing`, `check_response` and `rpc/service`; Eider 0.4 brought what the example
waited for: automatic JSON derive (#99), Strings across the WebAssembly boundary, core.sys
in `--wasm` (#137), `std/log`, `std/config` and `std/service` (#24), `main` returning
`Result` (#12), records spanning lines without commas (#76) and floats (#43; money stays
integer cents). `Trait.m(x)`, associated types and `dyn Trait` are not used: nothing here
needed them.

## Versions

`VERSION` holds this example's version; [CHANGELOG.md](CHANGELOG.md) lists the changes.
