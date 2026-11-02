// The shared Eider package (shared/*.ei), compiled to WebAssembly by
// `eider build --wasm shared-wasm/wasm.ei`, as typed TypeScript functions.
//
// The module's text exports take and return a `string` (the generated loader copies it in
// and out of the module's memory): a request of `<key> <value>` lines (shared-wasm/wire.ei)
// in, JSON out. The integer exports are called directly (BigInt for i64). The export names
// and types come from the generated shared.d.ts.

import { load, type EiderExports } from "./wasm/shared.js";

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
  private constructor(private raw: EiderExports) {}

  /** Instantiates the module from its bytes (`fetch(url)` in a page, a file in Node). */
  static async load(bytes: BufferSource): Promise<Shop> {
    return new Shop(await load(bytes));
  }

  /** "$1,234.05", by shared/money's `format`. */
  formatCents(cents: number): string {
    return this.raw.format_cents(String(cents));
  }

  /** unit * qty, checked by shared/money; null when out of range. */
  lineTotal(unitCents: number, qty: number): number | null {
    const r = this.raw.line_total_cents(BigInt(unitCents), BigInt(qty));
    return r < 0n ? null : Number(r);
  }

  /** Whether `qty` of a product fits a cart with `have` in stock (shared/validate). */
  checkQty(productId: number, qty: number, have: number): Answer<object> {
    return JSON.parse(this.raw.check_qty(`product ${productId}\nqty ${qty}\nstock ${have}`));
  }

  /** The totals of a cart, by shared/cart's `quote`: what the server will charge. */
  quote(lines: LineInput[], coupon?: string | null): Answer<Totals> {
    const req = lines.map((l) => `line ${l.product_id} ${l.unit_cents} ${l.qty}`);
    if (coupon) req.unshift(`coupon ${oneLine(coupon)}`);
    return JSON.parse(this.raw.quote(req.join("\n")));
  }

  /** The cleaned name and email, or every field error (shared/validate's `customer`). */
  checkCustomer(name: string, email: string): Answer<{ name: string; email: string }> {
    return JSON.parse(this.raw.check_customer(`name ${oneLine(name)}\nemail ${oneLine(email)}`));
  }

  /** The coupon with this code (shared/coupon's `find`). */
  findCoupon(code: string): Answer<{ coupon: CouponInfo }> {
    return JSON.parse(this.raw.find_coupon(`coupon ${oneLine(code)}`));
  }

  get maxQty(): number {
    return Number(this.raw.max_qty());
  }
  get taxBasisPoints(): number {
    return Number(this.raw.tax_bp());
  }
  get freeShippingFromCents(): number {
    return Number(this.raw.free_shipping_from_cents());
  }
}

/** A request is lines, so a value can't hold a line break. */
const oneLine = (s: string) => s.replace(/[\r\n]/g, " ");
