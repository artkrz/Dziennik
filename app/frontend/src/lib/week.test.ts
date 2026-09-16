import { describe, it, expect } from "vitest";
import { formatDate, mondayOf } from "./week";

describe("mondayOf", () => {
  it("returns the Monday of the same week for a Wednesday", () => {
    // Wednesday 2026-01-07
    const wednesday = new Date(2026, 0, 7);
    const result = mondayOf(wednesday);
    expect(formatDate(result)).toBe("2026-01-05");
  });

  it("returns itself (same date) for a Monday", () => {
    const monday = new Date(2026, 0, 5);
    const result = mondayOf(monday);
    expect(formatDate(result)).toBe("2026-01-05");
  });

  it("returns the Monday six days earlier for a Sunday, not the next day", () => {
    // Sunday 2026-01-11 belongs to the week starting Monday 2026-01-05.
    const sunday = new Date(2026, 0, 11);
    const result = mondayOf(sunday);
    expect(formatDate(result)).toBe("2026-01-05");
  });

  it("returns a new Date instance and does not mutate the input", () => {
    const wednesday = new Date(2026, 0, 7);
    const original = new Date(wednesday);
    const result = mondayOf(wednesday);
    expect(result).not.toBe(wednesday);
    expect(wednesday.getTime()).toBe(original.getTime());
  });
});

describe("formatDate", () => {
  it("zero-pads single-digit month and day", () => {
    const date = new Date(2026, 0, 5); // January 5th
    expect(formatDate(date)).toBe("2026-01-05");
  });

  it("leaves two-digit month and day unchanged", () => {
    const date = new Date(2026, 10, 21); // November 21st
    expect(formatDate(date)).toBe("2026-11-21");
  });
});
