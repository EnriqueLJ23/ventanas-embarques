import { describe, it, expect } from "vitest";
import { getDelayThresholdToNotify } from "./delayThresholds";

describe("getDelayThresholdToNotify", () => {
  it("returns null when elapsed time is under the first threshold", () => {
    expect(getDelayThresholdToNotify(10, null)).toBeNull();
  });

  it("returns 15 exactly at the 15-minute mark with no prior notification", () => {
    expect(getDelayThresholdToNotify(15, null)).toBe(15);
  });

  it("returns 15 between the 15 and 30 minute marks with no prior notification", () => {
    expect(getDelayThresholdToNotify(20, null)).toBe(15);
  });

  it("returns null when already notified at the applicable threshold", () => {
    expect(getDelayThresholdToNotify(20, 15)).toBeNull();
  });

  it("returns 30 once past the 30-minute mark even if 15 was already notified", () => {
    expect(getDelayThresholdToNotify(35, 15)).toBe(30);
  });

  it("returns only the highest applicable threshold when multiple were skipped", () => {
    expect(getDelayThresholdToNotify(70, null)).toBe(60);
  });

  it("returns null once the highest threshold (60) has already been notified", () => {
    expect(getDelayThresholdToNotify(90, 60)).toBeNull();
  });
});
