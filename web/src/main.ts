// The Eider Shop's page: five views over the typed API client (api/client.ts) and the
// shared Eider package as WebAssembly (shop.ts). Plain DOM, no framework; text is always set
// with textContent, never parsed as HTML.
//
// What runs as Eider in the browser: money formatting, quantity and stock checks before a
// line is sent, the cart's totals (shown next to the server's, which must agree), coupon
// lookup, and the checkout form's validation. The server enforces the same rules with the
// same code, so this is for speed and messages, not trust.

import "./style.css";
import wasmUrl from "./wasm/shared.wasm?url";
import { ApiError, type Cart, type Client, type Order, type Product, makeClient, ok } from "./api/client";
import { Shop } from "./shop";

// In dev (scripts/dev.sh) the page on :5173 calls the Eider server on :8080 directly, which
// allows that origin with CORS; built, the page is served by the Eider server itself.
const api: Client = makeClient(import.meta.env.VITE_API_BASE ?? "");
let shop: Shop;
const app = document.getElementById("app")!;

// ---- DOM helpers

type Attrs = Record<string, string | ((e: Event) => void)>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "function") el.addEventListener(k, v);
    else el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}
const money = (cents: number) => shop.formatCents(cents);
function show(...kids: Node[]) {
  app.replaceChildren(...kids);
}
function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : String(e);
}

// ---- the cart, kept on the server; its id in localStorage

const CART_KEY = "eider-shop-cart";
async function currentCart(): Promise<Cart> {
  const id = Number(localStorage.getItem(CART_KEY));
  if (id > 0) {
    try {
      return await ok(api.GET("/api/carts/{id}", { params: { path: { id } } }));
    } catch (e) {
      if (!(e instanceof ApiError && e.problem.status === 404)) throw e;
    }
  }
  const cart = await ok(api.POST("/api/carts"));
  localStorage.setItem(CART_KEY, String(cart.id));
  return cart;
}
function setCount(cart: Cart) {
  document.getElementById("cart-count")!.textContent = String(cart.lines.reduce((n, l) => n + l.qty, 0));
}

// ---- views

async function products() {
  const [list, cart] = await Promise.all([ok(api.GET("/api/products")), currentCart()]);
  setCount(cart);
  show(h("h1", {}, "Products"), h("div", { class: "grid" }, ...list.map((p) => productCard(p, cart))));
}

function productCard(p: Product, cart: Cart): HTMLElement {
  const inCart = cart.lines.find((l) => l.product_id === p.id)?.qty ?? 0;
  const qty = h("input", { type: "number", min: "1", max: String(shop.maxQty), value: "1", "aria-label": `Quantity of ${p.name}` });
  const err = h("div", { class: "error", "data-testid": `error-${p.id}` });
  const add = h("button", { "data-testid": `add-${p.id}` }, "Add to cart");
  const check = () => {
    // shared/validate, in the browser: the merged line must fit the quantity limit and the stock
    const r = shop.checkQty(p.id, inCart + Number(qty.value), p.stock);
    err.textContent = r.ok ? "" : r.errors.map((x) => x.message).join("; ");
    add.toggleAttribute("disabled", !r.ok);
    return r.ok;
  };
  qty.addEventListener("input", check);
  add.addEventListener("click", async () => {
    if (!check()) return;
    try {
      const updated = await ok(api.POST("/api/carts/{id}/lines", { params: { path: { id: cart.id } }, body: { product_id: p.id, qty: Number(qty.value) } }));
      await products();
      setCount(updated);
    } catch (e) {
      err.textContent = errorText(e);
    }
  });
  if (p.stock === 0) add.toggleAttribute("disabled", true);
  return h(
    "div",
    { class: "card", "data-testid": `product-${p.id}` },
    h("h3", {}, p.name),
    h("p", { class: "muted" }, p.description),
    h("p", {}, h("span", { class: "price" }, money(p.price_cents)), ` · ${p.stock} in stock`, inCart ? ` · ${inCart} in your cart` : ""),
    h("div", {}, qty, " ", add),
    err,
  );
}

function totalsTable(q: Cart["quote"], testid: string): HTMLElement {
  const row = (label: string, cents: number, cls = "") => h("tr", { class: cls }, h("td", {}, label), h("td", { class: "num" }, money(cents)));
  return h(
    "table",
    { class: "totals", "data-testid": testid },
    row("Subtotal", q.subtotal_cents),
    ...(q.discount_cents ? [row("Discount", q.discount_cents)] : []),
    row("Shipping", q.shipping_cents),
    row(`Tax (${shop.taxBasisPoints / 100}%)`, q.tax_cents),
    row("Total", q.total_cents, "total"),
  );
}

async function cartView() {
  const cart = await currentCart();
  setCount(cart);
  if (cart.lines.length === 0) {
    show(h("h1", {}, "Cart"), h("p", { "data-testid": "empty-cart" }, "Your cart is empty. ", h("a", { href: "#/" }, "Browse the products.")));
    return;
  }
  const err = h("div", { class: "error", "data-testid": "cart-error" });
  const rows = cart.lines.map((l) => {
    const qty = h("input", { type: "number", min: "0", max: String(shop.maxQty), value: String(l.qty), "aria-label": `Quantity of ${l.name}`, "data-testid": `qty-${l.product_id}` });
    qty.addEventListener("change", () => change(api.PUT("/api/carts/{id}/lines/{product_id}", { params: { path: { id: cart.id, product_id: l.product_id } }, body: { qty: Number(qty.value) } })));
    const rm = h("button", { class: "secondary", "data-testid": `remove-${l.product_id}` }, "Remove");
    rm.addEventListener("click", () => change(api.DELETE("/api/carts/{id}/lines/{product_id}", { params: { path: { id: cart.id, product_id: l.product_id } } })));
    return h("tr", {}, h("td", {}, l.name), h("td", { class: "num" }, money(l.unit_cents)), h("td", {}, qty), h("td", { class: "num" }, money(l.line_total_cents)), h("td", {}, rm));
  });
  const change = async (call: Promise<{ data?: Cart; error?: unknown; response: Response }>) => {
    try {
      await ok(call);
      await cartView();
    } catch (e) {
      err.textContent = errorText(e);
    }
  };

  // the coupon: looked up by the shared package first, then applied on the server
  const code = h("input", { placeholder: "Coupon code", value: cart.coupon ?? "", "aria-label": "Coupon code", "data-testid": "coupon" });
  const couponInfo = h("span", { class: "muted", "data-testid": "coupon-info" });
  const apply = h("button", { class: "secondary", "data-testid": "apply-coupon" }, "Apply");
  apply.addEventListener("click", () => {
    const found = shop.findCoupon(code.value);
    if (!found.ok) {
      couponInfo.textContent = found.errors.map((x) => x.message).join("; ");
      return;
    }
    change(api.PUT("/api/carts/{id}/coupon", { params: { path: { id: cart.id } }, body: { code: code.value } }));
  });
  if (cart.coupon) {
    const c = shop.findCoupon(cart.coupon);
    couponInfo.textContent = c.ok ? `${c.coupon.code}: ${c.coupon.description}${cart.quote.coupon_applied ? "" : " (not applied: the subtotal is too small)"}` : "";
  }

  // the totals, computed here by the shared package, must be the server's
  const local = shop.quote(cart.lines.map((l) => ({ product_id: l.product_id, unit_cents: l.unit_cents, qty: l.qty })), cart.coupon);
  const agree = local.ok && local.total_cents === cart.quote.total_cents && local.tax_cents === cart.quote.tax_cents && local.discount_cents === cart.quote.discount_cents;
  const badge = h(
    "p",
    { class: agree ? "ok muted" : "error", "data-testid": "totals-agree" },
    agree ? "✓ Totals computed in your browser by the Eider WebAssembly module match the server's." : "The totals computed here differ from the server's.",
  );

  show(
    h("h1", {}, "Cart"),
    h("table", { "data-testid": "cart-lines" }, h("tr", {}, h("th", {}, "Product"), h("th", { class: "num" }, "Price"), h("th", {}, "Qty"), h("th", { class: "num" }, "Total"), h("th", {})), ...rows),
    err,
    h("p", {}, code, " ", apply, " ", couponInfo),
    totalsTable(cart.quote, "cart-totals"),
    badge,
    h("p", {}, h("a", { href: "#/checkout", "data-testid": "to-checkout" }, h("button", {}, "Checkout"))),
  );
}

async function checkout() {
  const cart = await currentCart();
  if (cart.lines.length === 0) {
    location.hash = "#/cart";
    return;
  }
  const name = h("input", { id: "name", autocomplete: "name", "data-testid": "name" });
  const email = h("input", { id: "email", type: "email", autocomplete: "email", "data-testid": "email" });
  const nameErr = h("div", { class: "error", "data-testid": "name-error" });
  const emailErr = h("div", { class: "error", "data-testid": "email-error" });
  const formErr = h("div", { class: "error", "data-testid": "checkout-error" });
  const validate = (all: boolean) => {
    // shared/validate's `customer`, in the browser
    const r = shop.checkCustomer(name.value, email.value);
    const msg = (field: string) => (r.ok ? "" : r.errors.filter((x) => x.field === field).map((x) => x.message).join("; "));
    if (all || name.value) nameErr.textContent = msg("name");
    if (all || email.value) emailErr.textContent = msg("email");
    return r.ok;
  };
  name.addEventListener("blur", () => validate(false));
  email.addEventListener("blur", () => validate(false));
  const form = h(
    "form",
    { "data-testid": "checkout-form" },
    h("label", { for: "name" }, "Name"),
    name,
    nameErr,
    h("label", { for: "email" }, "Email"),
    email,
    emailErr,
    totalsTable(cart.quote, "checkout-totals"),
    h("button", { type: "submit", "data-testid": "place-order" }, `Place order · ${money(cart.quote.total_cents)}`),
    formErr,
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!validate(true)) return;
    try {
      const order = await ok(api.POST("/api/carts/{id}/checkout", { params: { path: { id: cart.id } }, body: { name: name.value, email: email.value } }));
      localStorage.removeItem(CART_KEY);
      localStorage.setItem("eider-shop-email", order.email);
      location.hash = `#/orders/${order.id}`;
    } catch (e) {
      if (e instanceof ApiError) {
        nameErr.textContent = e.fieldErrors("name").join("; ");
        emailErr.textContent = e.fieldErrors("email").join("; ");
      }
      formErr.textContent = errorText(e);
    }
  });
  show(h("h1", {}, "Checkout"), form);
}

function orderTable(o: Order): HTMLElement {
  return h(
    "table",
    {},
    h("tr", {}, h("th", {}, "Product"), h("th", { class: "num" }, "Price"), h("th", { class: "num" }, "Qty"), h("th", { class: "num" }, "Total")),
    ...o.lines.map((l) => h("tr", {}, h("td", {}, l.name), h("td", { class: "num" }, money(l.unit_cents)), h("td", { class: "num" }, String(l.qty)), h("td", { class: "num" }, money(l.line_total_cents)))),
  );
}

async function confirmation(id: number) {
  const o = await ok(api.GET("/api/orders/{id}", { params: { path: { id } } }));
  setCount(await currentCart());
  show(
    h("h1", { "data-testid": "confirmation" }, `Thank you, ${o.name}!`),
    h("p", {}, `Order #${o.id} is placed. A receipt would go to ${o.email}.`),
    orderTable(o),
    totalsTable(o.quote, "order-totals"),
    h("p", {}, h("a", { href: "#/orders" }, "All orders"), " · ", h("a", { href: "#/" }, "Keep shopping")),
  );
}

async function orders() {
  const email = h("input", { type: "email", placeholder: "Your email", value: localStorage.getItem("eider-shop-email") ?? "", "data-testid": "orders-email" });
  const list = h("div", { "data-testid": "orders-list" });
  const load = async () => {
    const query = email.value ? { email: email.value } : {};
    const os = await ok(api.GET("/api/orders", { params: { query } }));
    list.replaceChildren(
      ...(os.length === 0
        ? [h("p", { class: "muted" }, "No orders yet.")]
        : os.map((o) =>
            h(
              "div",
              { class: "card", "data-testid": `order-${o.id}` },
              h("h3", {}, h("a", { href: `#/orders/${o.id}` }, `Order #${o.id}`), ` · ${money(o.quote.total_cents)}`),
              h("p", { class: "muted" }, `${o.name} <${o.email}> · ${new Date(o.created_at).toLocaleString()} · ${o.lines.length} line(s)`),
            ),
          )),
    );
  };
  const filter = h("button", { class: "secondary" }, "Show");
  filter.addEventListener("click", () => load().catch((e) => list.replaceChildren(h("p", { class: "error" }, errorText(e)))));
  show(h("h1", {}, "Orders"), h("p", {}, email, " ", filter), list);
  await load();
}

// ---- routing

async function route() {
  const hash = location.hash || "#/";
  const m = /^#\/orders\/(\d+)$/.exec(hash);
  try {
    if (m) await confirmation(Number(m[1]));
    else if (hash === "#/cart") await cartView();
    else if (hash === "#/checkout") await checkout();
    else if (hash === "#/orders") await orders();
    else await products();
  } catch (e) {
    show(h("p", { class: "error" }, `Something went wrong: ${errorText(e)}`));
  }
}

async function start() {
  shop = await Shop.load(await (await fetch(wasmUrl)).arrayBuffer());
  window.addEventListener("hashchange", route);
  await route();
}
start();
