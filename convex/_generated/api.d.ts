/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attendance from "../attendance.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as dataOverview from "../dataOverview.js";
import type * as goals from "../goals.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_flags from "../lib/flags.js";
import type * as lib_images from "../lib/images.js";
import type * as lib_kpis from "../lib/kpis.js";
import type * as lib_mailer from "../lib/mailer.js";
import type * as lib_reportCard from "../lib/reportCard.js";
import type * as lib_reportEmail from "../lib/reportEmail.js";
import type * as lib_stats from "../lib/stats.js";
import type * as lib_time from "../lib/time.js";
import type * as lib_validation from "../lib/validation.js";
import type * as parentEmails from "../parentEmails.js";
import type * as parentEmailsActions from "../parentEmailsActions.js";
import type * as practices from "../practices.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as skills from "../skills.js";
import type * as students from "../students.js";
import type * as tests_helpers from "../tests/helpers.js";
import type * as times from "../times.js";
import type * as training from "../training.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attendance: typeof attendance;
  auth: typeof auth;
  crons: typeof crons;
  dashboard: typeof dashboard;
  dataOverview: typeof dataOverview;
  goals: typeof goals;
  groups: typeof groups;
  http: typeof http;
  insights: typeof insights;
  "lib/access": typeof lib_access;
  "lib/flags": typeof lib_flags;
  "lib/images": typeof lib_images;
  "lib/kpis": typeof lib_kpis;
  "lib/mailer": typeof lib_mailer;
  "lib/reportCard": typeof lib_reportCard;
  "lib/reportEmail": typeof lib_reportEmail;
  "lib/stats": typeof lib_stats;
  "lib/time": typeof lib_time;
  "lib/validation": typeof lib_validation;
  parentEmails: typeof parentEmails;
  parentEmailsActions: typeof parentEmailsActions;
  practices: typeof practices;
  reports: typeof reports;
  seed: typeof seed;
  skills: typeof skills;
  students: typeof students;
  "tests/helpers": typeof tests_helpers;
  times: typeof times;
  training: typeof training;
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
