/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as autoNudge from "../autoNudge.js";
import type * as crons from "../crons.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as nudge from "../nudge.js";
import type * as push from "../push.js";
import type * as pushActions from "../pushActions.js";
import type * as todos from "../todos.js";
import type * as unlockKeys from "../unlockKeys.js";
import type * as userScope from "../userScope.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  autoNudge: typeof autoNudge;
  crons: typeof crons;
  history: typeof history;
  http: typeof http;
  nudge: typeof nudge;
  push: typeof push;
  pushActions: typeof pushActions;
  todos: typeof todos;
  unlockKeys: typeof unlockKeys;
  userScope: typeof userScope;
  users: typeof users;
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
