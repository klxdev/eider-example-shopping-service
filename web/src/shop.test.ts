// The Eider shared package as WebAssembly, from TypeScript: the same numbers as the Eider
// tests (shared/tests/cart_test.ei) and the server's end-to-end test.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { ErrorCode, Shop } from "./shop";

let shop: Shop;
beforeAll(async () => {
  shop = await Shop.load(readFileSync(new URL("./wasm/shared.wasm", import.meta.url)));
});

describe("money", () => {
  it("formats cents", () => {
    expect(shop.formatCents(0)).toBe("$0.00");
    expect(shop.formatCents(123456789)).toBe("$1,234,567.89");
  });
  it("checks line totals", () => {
    expect(shop.lineTotal(1299, 2)).toBe(2598);
    expect(shop.lineTotal(1299, 0)).toBeNull();
    expect(shop.lineTotal(2 ** 53, 1)).toBeNull();
  });
});

describe("quote", () => {
  it("prices a cart like the server", () => {
    const q = shop.quote([
      { product_id: 1, unit_cents: 1299, qty: 2 },
      { product_id: 3, unit_cents: 450, qty: 1 },
    ]);
    expect(q).toEqual({
      ok: true,
      subtotal_cents: 3048,
      discount_cents: 0,
      shipping_cents: 599,
      tax_cents: 251,
      total_cents: 3898,
      coupon_applied: false,
    });
  });
  it("applies coupons", () => {
    const q = shop.quote([{ product_id: 1, unit_cents: 1299, qty: 2 }], " take5 ");
    expect(q.ok && q.total_cents).toBe(2870);
    const small = shop.quote([{ product_id: 3, unit_cents: 450, qty: 1 }], "TAKE5");
    expect(small.ok && small.coupon_applied).toBe(false);
  });
  it("reports every bad line", () => {
    const q = shop.quote([
      { product_id: 1, unit_cents: 1299, qty: 0 },
      { product_id: 2, unit_cents: 1, qty: 11 },
    ]);
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.errors.map((e) => e.code)).toEqual([ErrorCode.QtyOutOfRange, ErrorCode.QtyOutOfRange]);
  });
  it("can't overflow", () => {
    const q = shop.quote([
      { product_id: 1, unit_cents: 2 ** 53 - 1, qty: 1 },
      { product_id: 2, unit_cents: 1, qty: 1 },
    ]);
    expect(q.ok || q.errors[0]?.code).toBe(ErrorCode.AmountTooLarge);
  });
});

describe("validation", () => {
  it("checks quantities against stock", () => {
    expect(shop.checkQty(6, 2, 2).ok).toBe(true);
    const r = shop.checkQty(6, 3, 2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toEqual({ code: ErrorCode.OutOfStock, field: "qty", message: "only 2 of product 6 in stock (wanted 3)" });
  });
  it("cleans and checks the customer", () => {
    expect(shop.checkCustomer("  Ada ", "ada@EXAMPLE.com")).toEqual({ ok: true, name: "Ada", email: "ada@example.com" });
    const bad = shop.checkCustomer("", "ada@nowhere");
    expect(bad.ok ? [] : bad.errors.map((e) => e.field)).toEqual(["name", "email"]);
  });
  it("handles non-ASCII text", () => {
    expect(shop.checkCustomer("Zoë Ñuñez", "zoe@example.com").ok).toBe(true);
  });
  it("finds coupons", () => {
    const c = shop.findCoupon("save10");
    expect(c.ok && c.coupon).toEqual({ id: 1, code: "SAVE10", description: "10% off", min_cents: 0 });
    const none = shop.findCoupon("NOPE");
    expect(none.ok || none.errors[0]?.message).toBe("there is no coupon NOPE");
  });
  it("exposes the shop's constants", () => {
    expect(shop.maxQty).toBe(10);
    expect(shop.taxBasisPoints).toBe(825);
    expect(shop.freeShippingFromCents).toBe(5000);
  });
});
