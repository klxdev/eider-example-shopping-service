// The shared Eider package (shared/*.ei), compiled to WebAssembly by
// `eider build --wasm shared/wasm.ei`, as typed TypeScript functions.
//
// Eider 0.2 exports take and return integers only, so (see shared/wasm.ei):
// - integer functions are called directly (BigInt for i64);
// - text and lists go through a buffer protocol: the request (shared/wire.ei's
//   `<key> <value>` lines) is handed to the module through two imports it calls,
//   `host_input_len` and `host_input_byte`, and the answer comes back as JSON text through
//   `print`, which the module writes with the `eider_write` import.
//
// The module is instantiated here rather than with the generated shared.js loader, because
// the loader keeps the module's memory to itself, so an `eider_write` passed to it gets a
// pointer it can't read (filed as eider-lang#138). The export names and types come
// from the generated shared.d.ts.

import type { EiderExports } from "./wasm/shared.js";

type Raw = { [K in keyof EiderExports as `eider_${K}`]: EiderExports[K] } & { memory: WebAssembly.Memory };

export type ShopErrorInfo = { code: number; field: string; message: string };
export type Answer<T> = ({ ok: true } & T) | { ok: false; errors: ShopErrorInfo[] };
export type Totals = {
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  coupon_applied: boolean;
};
export type CouponInfo = { id: number; code: string; description: string; min_cents: number };
export type LineInput = { product_id: number; unit_cents: number; qty: number };

/** The error codes of shared.ShopError (shared/shared.ei, `code`). */
export const ErrorCode = {
  AmountTooLarge: 1,
  QtyOutOfRange: 2,
  OutOfStock: 3,
  UnknownProduct: 4,
  TooManyLines: 5,
  UnknownCoupon: 6,
  CouponMinimum: 7,
  EmptyCart: 8,
  InvalidName: 9,
  InvalidEmail: 10,
  NotInCart: 11,
  BadInput: 12,
} as const;

export class Shop {
  private input = new Uint8Array();
  private output = "";
  private constructor(private raw: Raw) {}

  /** Instantiates the module from its bytes (`fetch(url)` in a page, a file in Node). */
  static async load(bytes: BufferSource): Promise<Shop> {
    let shop: Shop | undefined;
    const dec = new TextDecoder();
    const env = {
      eider_write: (p: number, n: number) => {
        shop!.output += dec.decode(new Uint8Array(shop!.raw.memory.buffer, p, n));
      },
      eider_now_ms: () => BigInt(Date.now()),
      host_input_len: () => shop!.input.length,
      host_input_byte: (i: number) => shop!.input[i] ?? -1,
    };
    const { instance } = await WebAssembly.instantiate(bytes, { env });
    shop = new Shop(instance.exports as unknown as Raw);
    return shop;
  }

  /** Runs a buffer function on `request` and parses its JSON answer. */
  private ask<T>(request: string, f: () => number): Answer<T> {
    this.input = new TextEncoder().encode(request);
    this.output = "";
    f();
    return JSON.parse(this.output.trim()) as Answer<T>;
  }

  private text(f: () => number): string {
    this.output = "";
    f();
    return this.output.trimEnd();
  }

  /** "$1,234.05", by shared/money's `format`. */
  formatCents(cents: number): string {
    return this.text(() => this.raw.eider_format_cents(BigInt(cents)));
  }

  /** unit * qty, checked by shared/money; null when out of range. */
  lineTotal(unitCents: number, qty: number): number | null {
    const r = this.raw.eider_line_total_cents(BigInt(unitCents), BigInt(qty));
    return r < 0n ? null : Number(r);
  }

  /** Whether `qty` of a product fits a cart with `have` in stock (shared/validate). */
  checkQty(productId: number, qty: number, have: number): Answer<object> {
    this.output = "";
    this.raw.eider_check_qty(BigInt(productId), BigInt(qty), BigInt(have));
    return JSON.parse(this.output.trim()) as Answer<object>;
  }

  /** The totals of a cart, by shared/cart's `quote`: what the server will charge. */
  quote(lines: LineInput[], coupon?: string | null): Answer<Totals> {
    const req = lines.map((l) => `line ${l.product_id} ${l.unit_cents} ${l.qty}`);
    if (coupon) req.unshift(`coupon ${coupon}`);
    return this.ask<Totals>(req.join("\n"), () => this.raw.eider_quote());
  }

  /** The cleaned name and email, or every field error (shared/validate's `customer`). */
  checkCustomer(name: string, email: string): Answer<{ name: string; email: string }> {
    const oneLine = (s: string) => s.replace(/[\r\n]/g, " ");
    return this.ask(`name ${oneLine(name)}\nemail ${oneLine(email)}`, () => this.raw.eider_check_customer());
  }

  /** The coupon with this code (shared/coupon's `find`). */
  findCoupon(code: string): Answer<{ coupon: CouponInfo }> {
    return this.ask(`coupon ${code.replace(/[\r\n]/g, " ")}`, () => this.raw.eider_find_coupon());
  }

  get maxQty(): number {
    return Number(this.raw.eider_max_qty());
  }
  get taxBasisPoints(): number {
    return Number(this.raw.eider_tax_bp());
  }
  get freeShippingFromCents(): number {
    return Number(this.raw.eider_free_shipping_from_cents());
  }
}
