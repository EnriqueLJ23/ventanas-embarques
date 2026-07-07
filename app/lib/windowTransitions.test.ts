import { describe, it, expect } from "vitest";
import { canArrive } from "./windowTransitions";

describe("canArrive", () => {
  it("returns true when status is SCHEDULED", () => {
    expect(canArrive("SCHEDULED")).toBe(true);
  });

  it("returns false when status is ARRIVED", () => {
    expect(canArrive("ARRIVED")).toBe(false);
  });

  it("returns false when status is IN_PROGRESS", () => {
    expect(canArrive("IN_PROGRESS")).toBe(false);
  });

  it("returns false when status is COMPLETED", () => {
    expect(canArrive("COMPLETED")).toBe(false);
  });

  it("returns false when status is CANCELLED", () => {
    expect(canArrive("CANCELLED")).toBe(false);
  });
});
