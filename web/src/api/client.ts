// The typed API client: openapi-fetch over the types generated from the Eider server's
// OpenAPI description (scripts/gen-api.mjs -> schema.d.ts). Every path, parameter, body and
// response here is checked by tsc against what the server registered.

import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export type Product = components["schemas"]["Product"];
export type Cart = components["schemas"]["Cart"];
export type CartLine = components["schemas"]["CartLine"];
export type Quote = components["schemas"]["Quote"];
export type Order = components["schemas"]["Order"];
export type Coupon = components["schemas"]["Coupon"];
export type Problem = components["schemas"]["Problem"];

/** A failed call: the server's problem+json (RFC 9457). */
export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
  }
  /** The messages for one body member (`#/email`), for a form field. */
  fieldErrors(member: string): string[] {
    return (this.problem.errors ?? []).filter((e) => e.pointer === `#/${member}`).map((e) => e.detail);
  }
}

export function makeClient(baseUrl = "", fetchImpl?: typeof fetch) {
  return createClient<paths>({ baseUrl, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
}

export type Client = ReturnType<typeof makeClient>;

/** The data of a call, or an ApiError with its problem. */
export async function ok<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call;
  if (data !== undefined && response.ok) return data;
  const problem = (error ?? {}) as Partial<Problem>;
  throw new ApiError({ type: "about:blank", title: response.statusText, status: response.status, ...problem });
}
