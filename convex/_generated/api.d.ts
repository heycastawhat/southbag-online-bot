/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as beg from "../beg.js";
import type * as crypto from "../crypto.js";
import type * as daily from "../daily.js";
import type * as gambling from "../gambling.js";
import type * as heist from "../heist.js";
import type * as insurance from "../insurance.js";
import type * as jobs from "../jobs.js";
import type * as loans from "../loans.js";
import type * as messages from "../messages.js";
import type * as transactions from "../transactions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  beg: typeof beg;
  crypto: typeof crypto;
  daily: typeof daily;
  gambling: typeof gambling;
  heist: typeof heist;
  insurance: typeof insurance;
  jobs: typeof jobs;
  loans: typeof loans;
  messages: typeof messages;
  transactions: typeof transactions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
