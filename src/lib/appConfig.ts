import { apiClient } from "./apiClient";
import type { School } from "../context/AuthContext";

/**
 * Public server configuration.
 *
 * Two things so far: whether online payment is switched on, and the platform
 * fee percentage charged on top of an order's subtotal. Neither can be
 * inferred by trying — a checkout POST against a payments-disabled deploy
 * fails only AFTER the order has been placed, and the fee has to appear on the
 * summary BEFORE the student agrees to pay it. So the checkout screen has to
 * know both before it renders.
 */

export interface AppConfig {
  paymentsEnabled: boolean;
  /** 0–100. Per-school, set by a superadmin; 0 for a school that has none. */
  platformFeePercent: number;
}

/**
 * Cached for the tab's lifetime, keyed by school.
 *
 * Keyed rather than a single slot because the fee is per-school now: one
 * cached answer would hand a DRK student KLH's fee, or vice versa, depending
 * purely on which page asked first. `undefined` (no school argument) is its own
 * key — the backend defaults it to KLH, and pretending that is the same request
 * as an explicit `?school=KLH` would couple two callers that need not agree.
 *
 * The promise itself is cached rather than the value, so several components
 * mounting at once share one request instead of racing.
 */
const configPromises = new Map<string, Promise<AppConfig>>();

/** Map key for a (possibly absent) school argument. */
function cacheKey(school?: School): string {
  return school ?? "";
}

export function getAppConfig(school?: School): Promise<AppConfig> {
  const key = cacheKey(school);
  let promise = configPromises.get(key);
  if (!promise) {
    const path = school ? `/config?school=${school}` : "/config";
    promise = apiClient.get<AppConfig>(path).catch((err: unknown) => {
      // A failed lookup must not cache a wrong answer for the whole session.
      configPromises.delete(key);
      throw err;
    });
    configPromises.set(key, promise);
  }
  return promise;
}

/**
 * The fee percentage a checkout should actually display, given a config
 * response.
 *
 * Anything not a finite positive number collapses to 0, which renders no fee
 * line at all. That is the honest failure mode: the server recomputes and
 * charges the real fee at order creation regardless of what this returns, so
 * the only thing at stake here is the number the student is shown, and
 * inventing one would put a charge on screen the backend may never make.
 *
 * A function rather than an inline check in each page because both checkouts
 * need the identical rule and a fee line that appears on one flow but not the
 * other is a support ticket nobody can reproduce.
 */
export function displayFeePercent(config: AppConfig): number {
  const { platformFeePercent } = config;
  return typeof platformFeePercent === "number" &&
    Number.isFinite(platformFeePercent) &&
    platformFeePercent > 0
    ? platformFeePercent
    : 0;
}

/**
 * Fee on a subtotal, rounded to paise the same way the backend rounds it.
 *
 * Kept here, beside the percentage it consumes, so the student and guest
 * checkouts cannot drift apart from each other or from
 * `orderService.createOrder`, which computes `Number((subtotal * (percent /
 * 100)).toFixed(2))` per kitchen-split order. The displayed total has to match
 * what is actually charged to the rupee.
 */
export function platformFeeFor(subtotal: number, percent: number): number {
  if (percent <= 0) return 0;
  return Number((subtotal * (percent / 100)).toFixed(2));
}

/** Test seam — drops the cached promises so a suite can vary the config. */
export function resetAppConfigCache(): void {
  configPromises.clear();
}
