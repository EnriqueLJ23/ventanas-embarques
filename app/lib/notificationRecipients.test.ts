import { describe, it, expect } from "vitest";
import { delayMinutesToEvent } from "./notificationRecipients.server";

describe("delayMinutesToEvent", () => {
  it("maps each threshold to its event", () => {
    expect(delayMinutesToEvent(15)).toBe("DELAY_15");
    expect(delayMinutesToEvent(30)).toBe("DELAY_30");
    expect(delayMinutesToEvent(45)).toBe("DELAY_45");
    expect(delayMinutesToEvent(60)).toBe("DELAY_60");
  });
});
