import { describe, it, expect } from "vitest";
import { buildCheckinUrl } from "./qr";

describe("buildCheckinUrl", () => {
  it("joins the origin and window id into a checkin path", () => {
    expect(buildCheckinUrl("https://embarques.tq1.com.mx", "w1")).toBe(
      "https://embarques.tq1.com.mx/checkin/w1"
    );
  });

  it("does not produce a double slash when origin has a trailing slash", () => {
    expect(buildCheckinUrl("https://embarques.tq1.com.mx/", "w1")).toBe(
      "https://embarques.tq1.com.mx/checkin/w1"
    );
  });
});
