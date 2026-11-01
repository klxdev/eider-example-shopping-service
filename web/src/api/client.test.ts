import { describe, expect, it } from "vitest";
import { ApiError, makeClient, ok } from "./client";

function fakeFetch(status: number, body: unknown, contentType = "application/json"): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const req = input instanceof Request ? input : new Request(input);
    expect(new URL(req.url).pathname).toBe("/api/carts/7");
    return new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });
  };
}

describe("client", () => {
  it("returns the data of a 2xx", async () => {
    const cart = { id: 7, lines: [], coupon: null, quote: { subtotal_cents: 0, discount_cents: 0, shipping_cents: 0, tax_cents: 0, total_cents: 0, coupon_applied: false } };
    const api = makeClient("http://shop.test", fakeFetch(200, cart));
    expect(await ok(api.GET("/api/carts/{id}", { params: { path: { id: 7 } } }))).toEqual(cart);
  });
  it("throws the problem of an error", async () => {
    const problem = { type: "about:blank", title: "Unprocessable Content", status: 422, detail: "the order details are not valid", errors: [{ in: "body", pointer: "#/email", detail: "the email address is not valid" }] };
    const api = makeClient("http://shop.test", fakeFetch(422, problem, "application/problem+json"));
    const err = await ok(api.GET("/api/carts/{id}", { params: { path: { id: 7 } } })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).problem.status).toBe(422);
    expect((err as ApiError).fieldErrors("email")).toEqual(["the email address is not valid"]);
  });
});
