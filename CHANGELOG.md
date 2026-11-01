# Changelog

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
