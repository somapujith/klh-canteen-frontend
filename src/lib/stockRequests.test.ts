import { describe, it, expect } from "vitest";
import { notifySummary, type NotifyResult } from "./stockRequests";

function result(over: Partial<NotifyResult> = {}): NotifyResult {
  return { cleared: 0, notified: 0, unreachable: 0, menuItemName: "Samosa", ...over };
}

describe("notifySummary", () => {
  it("names the item and the number told", () => {
    expect(notifySummary(result({ notified: 4, cleared: 4 }))).toBe(
      "Told 4 students that Samosa is back"
    );
  });

  it("uses the singular for one student", () => {
    expect(notifySummary(result({ notified: 1, cleared: 1 }))).toBe(
      "Told 1 student that Samosa is back"
    );
  });

  // The whole point of reporting reachability: an admin told "notified 6"
  // when two of them never linked Telegram would believe everyone knows.
  it("calls out students who could not be reached", () => {
    expect(notifySummary(result({ notified: 6, unreachable: 2, cleared: 8 }))).toBe(
      "Told 6 students that Samosa is back — 2 more had no Telegram linked"
    );
  });

  it("says plainly when nobody could be reached", () => {
    expect(notifySummary(result({ notified: 0, unreachable: 3, cleared: 3 }))).toBe(
      "Nobody could be reached — all 3 students waiting have no Telegram linked"
    );
  });

  it("keeps the singular when the only student waiting is unreachable", () => {
    expect(notifySummary(result({ notified: 0, unreachable: 1, cleared: 1 }))).toBe(
      "Nobody could be reached — the student waiting has no Telegram linked"
    );
  });
});
