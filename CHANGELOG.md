# Changelog

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
