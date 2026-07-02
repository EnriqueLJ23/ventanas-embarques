import { describe, it, expect } from "vitest";
import { canArrive, canStart } from "./windowTransitions";

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

describe("canStart", () => {
  it("returns true when status is SCHEDULED", () => {
    expect(canStart("SCHEDULED")).toBe(true);
  });

  it("returns true when status is ARRIVED", () => {
    expect(canStart("ARRIVED")).toBe(true);
  });

  it("returns false when status is IN_PROGRESS", () => {
    expect(canStart("IN_PROGRESS")).toBe(false);
  });

  it("returns false when status is COMPLETED", () => {
    expect(canStart("COMPLETED")).toBe(false);
  });

  it("returns false when status is CANCELLED", () => {
    expect(canStart("CANCELLED")).toBe(false);
  });
});
