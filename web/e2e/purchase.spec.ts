// A shopper's whole visit, in Chromium: browse, add to the cart (with the Eider wasm
// module refusing more than the stock before any request), see totals that the browser and
// the server agree on, apply a coupon, check out with validation, see the confirmation and
// the order history.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, expect, test } from "@playwright/test";

// Skip, with the reason, where Chromium isn't installed or can't start (missing system
// libraries); README.md "End-to-end test in a browser" says how to run it there. Checked
// before the browser fixture launches, by running the binary once.
function unavailable(): string {
  const exe = chromium.executablePath();
  if (!existsSync(exe)) return `Chromium for Playwright is not installed (${exe}); run \`npx playwright install chromium\` in web/`;
  const r = spawnSync(exe, ["--headless", "--version"], { encoding: "utf8" });
  if (r.status === 0) return "";
  const why = /error while loading shared libraries: \S+/.exec(r.stderr ?? "")?.[0] ?? `exit ${r.status}`;
  return `Chromium can't start here (${why}); install its system libraries (\`npx playwright install-deps chromium\`) or point LD_LIBRARY_PATH at them`;
}
const reason = unavailable();
if (reason) console.warn(`purchase.spec.ts: skipped: ${reason}`);
test.skip(reason !== "", reason);

test("a purchase from product list to order history", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("product-1")).toContainText("Eider mug");
  await expect(page.getByTestId("product-1")).toContainText("$12.99");

  // two mugs and a sticker pack
  await page.getByTestId("product-1").getByRole("spinbutton").fill("2");
  await page.getByTestId("add-1").click();
  await expect(page.getByTestId("product-1")).toContainText("2 in your cart");
  await page.getByTestId("add-3").click();
  await expect(page.locator("#cart-count")).toHaveText("3");

  // only two pins exist: the shared package (WebAssembly) refuses three in the browser
  await page.getByTestId("product-6").getByRole("spinbutton").fill("3");
  await expect(page.getByTestId("error-6")).toHaveText("only 2 of product 6 in stock (wanted 3)");
  await expect(page.getByTestId("add-6")).toBeDisabled();

  // the cart: the server's totals, and the browser's agreeing
  await page.getByTestId("nav-cart").click();
  const totals = page.getByTestId("cart-totals");
  await expect(totals).toContainText("$30.48");
  await expect(totals).toContainText("$5.99");
  await expect(totals).toContainText("$2.51");
  await expect(totals).toContainText("$38.98");
  await expect(page.getByTestId("totals-agree")).toContainText("match the server's");

  // an unknown coupon is caught locally; TAKE5 is applied by the server
  await page.getByTestId("coupon").fill("bogus");
  await page.getByTestId("apply-coupon").click();
  await expect(page.getByTestId("coupon-info")).toHaveText("there is no coupon BOGUS");
  await page.getByTestId("coupon").fill("take5");
  await page.getByTestId("apply-coupon").click();
  await expect(page.getByTestId("coupon-info")).toContainText("TAKE5: $5.00 off orders of $25.00 or more");
  await expect(totals).toContainText("$33.57");
  await expect(page.getByTestId("totals-agree")).toContainText("match the server's");

  // one sticker pack less, then on to checkout
  await page.getByTestId("remove-3").click();
  await expect(page.getByTestId("cart-lines")).not.toContainText("Sticker pack");
  await expect(totals).toContainText("$28.70");
  await page.getByTestId("to-checkout").click();

  // the form is validated by the shared package before it is sent
  await page.getByTestId("email").fill("ada@nowhere");
  await page.getByTestId("place-order").click();
  await expect(page.getByTestId("name-error")).toHaveText("the name must be 1 to 80 characters");
  await expect(page.getByTestId("email-error")).toHaveText("the email address is not valid");
  await page.getByTestId("name").fill("Ada Lovelace");
  await page.getByTestId("email").fill("ada@example.com");
  await page.getByTestId("place-order").click();

  // confirmation and history
  await expect(page.getByTestId("confirmation")).toHaveText("Thank you, Ada Lovelace!");
  await expect(page.getByTestId("order-totals")).toContainText("$28.70");
  await expect(page.locator("#cart-count")).toHaveText("0");
  await page.getByTestId("nav-orders").click();
  await expect(page.getByTestId("orders-list")).toContainText("Order #1");
  await expect(page.getByTestId("orders-list")).toContainText("$28.70");

  // the stock went down
  await page.getByTestId("nav-products").click();
  await expect(page.getByTestId("product-1")).toContainText("23 in stock");
});
