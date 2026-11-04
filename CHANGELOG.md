# Changelog

## 0.6.0

For Eider 0.6 (`eider = "0.6"`) and eider-http, eider-openapi, eider-rpc and eider-json 0.6.0.

- Serialization is opt-in: the records that reach JSON say `@[derive(Serialize)]` or
  `@[derive(Serialize, Deserialize)]`, `Money` implements `serial.Serialize`/`Deserialize`, and
  the attributes are `@[serial(...)]`/`@[json(flatten)]`. `json.to_json`/`from_json` became
  `json.to_bytes`/`to_string`/`from_bytes`. The schemas of the shared records are
  `impl derive.Schematic for ...` in `server/api.ei`.
- eider-openapi 0.6 checks `format: email` in the request schema, so a malformed address in a
  checkout is refused there with a 400 and a JSON pointer (it was a 422 from the domain rules); the
  end-to-end test expects the 400.

## 0.5.0

For Eider 0.5 (`eider = "0.5"`) and eider-http, eider-openapi, eider-rpc and eider-json 0.5.0.

- OpenAPI (`server/api.ei`, 355 -> 273 lines): the hand-written decoders, encoders and
  `openapi.typed(...)` triples are gone; routes use `json_out`, `json_body_with` over the
  request records (`AddIn`, `QtyIn`, `CodeIn`, `BuyerIn`) and the derived codecs. Schemas are
  `T.json_schema()` with the bounds a type can't state added by hand (`Money`'s range, quantity,
  length and email bounds); the `Quote`, `CartLine`, `OrderLine`, ... components stay, built from
  the derived ones. `lift_body`, `text`, `lit`, the `*_json` encoders, `LineArgs`, `Buyer` and the
  decode functions are deleted. A nullable member that is absent is no longer `required`
  (`coupon`), and `created_at` is `2025-11-01T00:00:00Z` (no milliseconds) from `std/time`.
- Admin API (`server/admin.ei`): `rpc/service` registers `stats`, `restock`, `set_price` over
  records (`Restock`, `SetPrice`), mounted as `admin.*`; the positional-parameter decoders are gone.
- Middleware (`server/app.ei`, `main.ei`): the access log goes through the service's `std/log`
  Logger (`access_log_with`), one trace span per request (`trace.wrap`, logged by `log_sink`) and
  per-route metrics (`metrics.by_route`, labelled by operation id). `Parts` is no longer generic
  over a writer.
- `json.to_string` replaces the `String.from_bytes(...).unwrap_or` shim in `shared-wasm/wire.ei`;
  `sys.to_string` replaces it in `main.ei` and `assets.ei`.
- Tests: the API is tested in process with `http/testing`, every response checked against its
  operation with `openapi.check_response`; the e2e test collects the trace spans and checks the
  per-route metrics label (50 checks); the access record's shape is checked with `access_line`.
- Not adopted: `std/cli` for the server's flags (it has no environment layer, and `SHOP_*` is
  how the dev script and the browser test configure the server, so `std/config` stays); a
  static-file handler (eider-http#7 is open); `svc.planner()` for body limits before the body
  is read.
- `eider lint` is clean on `main.ei` and the e2e test; library modules can't be linted yet
  (eider-lang#163). New gap: eider-lang#162.

## 0.3.0

For Eider 0.4 (`eider = "0.4"`) and eider-http, eider-openapi, eider-rpc and eider-json 0.4.0.

- JSON: every one-line `impl json.Encode/Decode { json.encode_record(...) }` is gone; the
  traits are `@derive` in eider-json 0.4, so `json.to_json` and `json.from_json` work on any
  record or enum. `Money`'s number encoding stays as a deliberate override. Request bodies
  (add a line, set a quantity, a coupon code, checkout) are read by derived decoding
  (`AddIn`, `QtyIn`, `CodeIn`, `BuyerIn`) instead of member-by-member accessors; a malformed
  body is a 400 naming the JSON path. `coupon.Info` is the one coupon view for the API and the
  WebAssembly module.
- WebAssembly: `quote`, `check_customer`, `find_coupon`, `check_qty` and `format_cents` are
  `String -> String` exports. The `host_input_len`/`host_input_byte` protocol, the
  `print`/`eider_write` capture, the hand-written instantiation in `shop.ts` and the
  hand-written JSON writers and `lit`/`to_string` helpers in `wire.ei` are deleted; the answers
  are `json.to_json` of derived types and `shop.ts` uses the generated loader. The module
  needs no capability now. `wasm.ei` 124 -> 70 lines, `wire.ei` 222 -> 207 (with `check_qty`
  and `format_cents` moved in), `shop.ts` 130 -> 93.
- Server: settings come from `std/config` (`--port`, `--admin.token`, `--web.dir`,
  `--cors.origin`, or `SHOP_*` variables; the old positional port and `PORT` are gone), the
  startup and shutdown lines are `std/log` JSON, SIGTERM/SIGINT drain through
  `std/service.cancel_on_term`, and `main` returns `Result[(), String]`. `main.ei` 152 -> 96
  lines.
- Records span lines without commas; test files have no empty `main`.
- Removed the `TODO(eider-lang#136/#137/#138/#139/#140)` comments the new features resolve.
  New gaps: eider-http#8 (access log through `std/log`) and eider-json#2 (`to_string`).

## 0.2.0

For Eider 0.3 (`eider = "0.3"`) and eider-http, eider-openapi, eider-rpc and eider-json 0.3.0.

- `shared-wasm/` (package `shared_wasm`): the WebAssembly entry (`wasm.ei`) and its protocol
  (`wire.ei`, with its test) moved out of `shared` (#2). With automatic grants a dependency's
  grant covers every module of it, so `wasm.ei`'s host imports made the server grant `shared`
  `ffi, io`; `shared` is pure again and the server grants it nothing.
- The API's responses (products, carts, orders, coupons) and the admin API's results are
  written by eider-json's derived codecs (`@json(name = ...)`, `@json(flatten)`) instead of
  hand-built objects; the JSON is unchanged.
- Messages are interpolated strings; error codes, fields and statuses use field patterns
  (`OutOfStock { .. }`) and or-patterns; the static files' media types are a `match` on the
  extension.
- The grant to eider-http is what its modules use: `clock, fs, io, net, threads`.
- scripts/env.sh no longer sets up a credential helper: eider-pkg authenticates github.com
  fetches itself (eider-lang#142).

## 0.1.0 (2026-11-01)

The first version (#1), built with the published Eider 0.2.0 toolchain and eider-http,
eider-openapi, eider-rpc and eider-json 0.2.0.

- `shared/`: money in integer cents with checked arithmetic, cart items and quotes
  (subtotal, coupons, shipping, 8.25% tax, total), coupons, quantity, stock, name and email
  validation, stable error codes and messages; compiled natively and to WebAssembly
  (`wasm.ei`, with a text-in, JSON-out protocol in `wire.ei`); Eider tests.
- `server/`: catalog, carts, checkout and orders over REST with an OpenAPI 3.1 description
  (`/openapi.json`), a JSON-RPC admin API (`/rpc`, bearer token), the in-memory store behind
  one `sync.Lock`, problem+json errors, validation from the operations, CORS for the dev
  server, `/health`, `/metrics`, a JSON access log, graceful shutdown on SIGTERM, and the
  built front end's files; unit tests and an end-to-end test over loopback.
- `web/`: a TypeScript page (products, cart, checkout, confirmation, order history) with a
  client generated from the server's description and the shared package as WebAssembly for
  totals and validation; vitest unit tests and a Playwright purchase test.
- `scripts/`: `build.sh`, `test.sh`, `dev.sh`.
