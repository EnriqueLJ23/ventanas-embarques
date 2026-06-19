import { describe, it, expect } from "vitest";
import { rangesOverlap, findOverlappingWindow } from "./windowOverlap";

describe("rangesOverlap", () => {
  it("returns true when ranges overlap partially", () => {
    const a = [new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z")];
    const b = [new Date("2026-01-01T10:30:00Z"), new Date("2026-01-01T11:30:00Z")];
    expect(rangesOverlap(a[0], a[1], b[0], b[1])).toBe(true);
  });

  it("returns true when one range fully contains the other", () => {
    const a = [new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T12:00:00Z")];
    const b = [new Date("2026-01-01T10:30:00Z"), new Date("2026-01-01T11:00:00Z")];
    expect(rangesOverlap(a[0], a[1], b[0], b[1])).toBe(true);
  });

  it("returns false when ranges are back-to-back with no gap", () => {
    const a = [new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z")];
    const b = [new Date("2026-01-01T11:00:00Z"), new Date("2026-01-01T12:00:00Z")];
    expect(rangesOverlap(a[0], a[1], b[0], b[1])).toBe(false);
  });

  it("returns false when ranges are fully separate", () => {
    const a = [new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T11:00:00Z")];
    const b = [new Date("2026-01-01T13:00:00Z"), new Date("2026-01-01T14:00:00Z")];
    expect(rangesOverlap(a[0], a[1], b[0], b[1])).toBe(false);
  });
});

describe("findOverlappingWindow", () => {
  const existing = [
    {
      id: "w1",
      warehouseId: "wh1",
      scheduledStart: new Date("2026-01-01T10:00:00Z"),
      scheduledEnd: new Date("2026-01-01T11:00:00Z"),
      status: "SCHEDULED",
    },
  ];

  it("finds a conflict in the same warehouse", () => {
    const result = findOverlappingWindow(
      {
        warehouseId: "wh1",
        scheduledStart: new Date("2026-01-01T10:30:00Z"),
        scheduledEnd: new Date("2026-01-01T11:30:00Z"),
      },
      existing
    );
    expect(result?.id).toBe("w1");
  });

  it("ignores a different warehouse even with the same time", () => {
    const result = findOverlappingWindow(
      {
        warehouseId: "wh2",
        scheduledStart: new Date("2026-01-01T10:30:00Z"),
        scheduledEnd: new Date("2026-01-01T11:30:00Z"),
      },
      existing
    );
    expect(result).toBeNull();
  });

  it("excludes the window being edited via excludeId", () => {
    const result = findOverlappingWindow(
      {
        warehouseId: "wh1",
        scheduledStart: new Date("2026-01-01T10:30:00Z"),
        scheduledEnd: new Date("2026-01-01T11:30:00Z"),
        excludeId: "w1",
      },
      existing
    );
    expect(result).toBeNull();
  });

  it("returns null when there is no overlap", () => {
    const result = findOverlappingWindow(
      {
        warehouseId: "wh1",
        scheduledStart: new Date("2026-01-01T12:00:00Z"),
        scheduledEnd: new Date("2026-01-01T13:00:00Z"),
      },
      existing
    );
    expect(result).toBeNull();
  });
});
