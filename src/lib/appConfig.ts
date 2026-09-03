import { apiClient } from "./apiClient";

/**
 * Public server configuration.
 *
 * Only one flag so far: whether online payment is switched on. The client
 * cannot infer that by trying, because a checkout POST against a
 * payments-disabled deploy fails only AFTER the order has been placed — so the
 * checkout screen has to know before it renders its pay button.
 */

export interface AppConfig {
  paymentsEnabled: boolean;
}

/**
 * Cached for the tab's lifetime.
 *
 * The flag changes only on redeploy, and every checkout would otherwise pay
 * for the same round trip. The promise itself is cached rather than the value,
 * so several components mounting at once share one request instead of racing.
 */
let configPromise: Promise<AppConfig> | null = null;

export function getAppConfig(): Promise<AppConfig> {
  if (!configPromise) {
    configPromise = apiClient.get<AppConfig>("/config").catch((err: unknown) => {
      // A failed lookup must not cache a wrong answer for the whole session.
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

/**
 * Whether to run the payment step.
 *
 * Falls back to `false` when the config call fails, which is deliberate: an
 * unreachable /config means we cannot prove payments are configured, and
 * guessing "on" would send the student into a checkout that 503s after their
 * order is already placed and holding stock. Guessing "off" costs, at worst,
 * a free order during an outage — recoverable, and visible to staff on the
 * board. The other direction strands food.
 */
export async function isPaymentsEnabled(): Promise<boolean> {
  try {
    const config = await getAppConfig();
    return config.paymentsEnabled === true;
  } catch {
    return false;
  }
}

/** Test seam — drops the cached promise so a suite can vary the flag. */
export function resetAppConfigCache(): void {
  configPromise = null;
}
