import { describe, it, expect } from "vitest";
import { Timetable, TimetableLesson } from "../api";
import {
  daysWithLessons,
  isWeekExhausted,
  lessonEndMinutes,
  lessonsFor,
  pickDefaultDay,
} from "./timetable";

// The reference week used throughout: Monday 2026-01-05 .. Sunday 2026-01-11.
// Dates are built with the numeric Date constructor so they are local time —
// the helpers read getHours()/getDay(), which are local too.
const WEEK_START = new Date(2026, 0, 5);
const HOURS = ["07:25 - 08:10", "08:15 - 09:00", "09:10 - 09:55"];

function lesson(subject: string): TimetableLesson {
  return { subject, teacher: "Nowak", room: "12", time: "" };
}

/** Build a timetable from an hour list and per-day subjects (null = free slot). */
function timetableOf(
  hours: string[],
  days: Record<string, (string | null)[]>
): Timetable {
  const table: Timetable["table"] = {};
  for (const [day, subjects] of Object.entries(days)) {
    table[day] = subjects.map((subject) => (subject === null ? null : lesson(subject)));
  }
  return { hours, table };
}

const EMPTY: Timetable = { hours: [], table: {} };

describe("lessonEndMinutes", () => {
  it("returns minutes past midnight of the slot's end", () => {
    expect(lessonEndMinutes("07:25 - 08:10")).toBe(8 * 60 + 10);
  });

  it("parses single-digit hours", () => {
    expect(lessonEndMinutes("7:25 - 8:10")).toBe(8 * 60 + 10);
  });

  it("returns null for an unparseable label", () => {
    expect(lessonEndMinutes("brak")).toBeNull();
  });

  it("returns null for an empty label", () => {
    expect(lessonEndMinutes("")).toBeNull();
  });
});

describe("lessonsFor", () => {
  it("skips free slots and pairs each lesson with its hour", () => {
    const timetable = timetableOf(HOURS, { Monday: [null, "Matematyka", null] });

    const rows = lessonsFor(timetable, "Monday");

    expect(rows).toHaveLength(1);
    expect(rows[0].hour).toBe("08:15 - 09:00");
    expect(rows[0].lesson?.subject).toBe("Matematyka");
  });

  it("returns nothing for a day the timetable does not contain", () => {
    expect(lessonsFor(timetableOf(HOURS, {}), "Friday")).toEqual([]);
  });
});

describe("daysWithLessons", () => {
  it("returns only days holding a lesson, in week order", () => {
    const timetable = timetableOf(HOURS, {
      Friday: ["Polski", null, null],
      Monday: ["Matematyka", null, null],
    });

    expect(daysWithLessons(timetable)).toEqual(["Monday", "Friday"]);
  });

  it("excludes a day whose slots are all free", () => {
    const timetable = timetableOf(HOURS, {
      Monday: ["Matematyka", null, null],
      Tuesday: [null, null, null],
    });

    expect(daysWithLessons(timetable)).toEqual(["Monday"]);
  });
});

describe("pickDefaultDay", () => {
  it("returns today while a lesson is still to come", () => {
    const timetable = timetableOf(HOURS, { Wednesday: ["Matematyka", "Polski", "WF"] });
    // Wednesday 09:00 — the 09:10-09:55 slot has not ended.
    const now = new Date(2026, 0, 7, 9, 0);

    expect(pickDefaultDay(timetable, now, WEEK_START)).toBe("Wednesday");
  });

  it("skips past an empty day to the next day that has lessons", () => {
    const timetable = timetableOf(HOURS, {
      Wednesday: ["Matematyka", null, null],
      Thursday: [null, null, null],
      Friday: ["Polski", null, null],
    });
    // Wednesday 10:00 — everything today has finished.
    const now = new Date(2026, 0, 7, 10, 0);

    expect(pickDefaultDay(timetable, now, WEEK_START)).toBe("Friday");
  });

  it("falls back to the first day with lessons once the week is over", () => {
    const timetable = timetableOf(HOURS, {
      Monday: ["Matematyka", null, null],
      Wednesday: ["Polski", null, null],
    });
    // Wednesday 10:00, and Wednesday is the last teaching day of the week.
    const now = new Date(2026, 0, 7, 10, 0);

    expect(pickDefaultDay(timetable, now, WEEK_START)).toBe("Monday");
  });

  it("treats a lesson ending exactly now as finished", () => {
    const timetable = timetableOf(HOURS, {
      Wednesday: ["Matematyka", "Polski", "WF"],
      Friday: ["Biologia", null, null],
    });
    // Wednesday 09:55 — precisely when the last slot ends.
    const now = new Date(2026, 0, 7, 9, 55);

    expect(pickDefaultDay(timetable, now, WEEK_START)).toBe("Friday");
  });

  it("returns the first day with lessons on a Saturday", () => {
    const timetable = timetableOf(HOURS, {
      Tuesday: ["Matematyka", null, null],
      Thursday: ["Polski", null, null],
    });
    const now = new Date(2026, 0, 10, 12, 0); // Saturday

    expect(pickDefaultDay(timetable, now, WEEK_START)).toBe("Tuesday");
  });

  it("returns the first day with lessons when now is a different week", () => {
    const timetable = timetableOf(HOURS, {
      Wednesday: ["Matematyka", null, null],
      Friday: ["Polski", null, null],
    });
    const now = new Date(2026, 0, 14, 9, 0); // the following Wednesday

    expect(pickDefaultDay(timetable, now, WEEK_START)).toBe("Wednesday");
  });

  it("returns the next day with lessons when today has none", () => {
    const timetable = timetableOf(HOURS, {
      Monday: ["Matematyka", null, null],
      Friday: ["Polski", null, null],
    });
    const now = new Date(2026, 0, 7, 9, 0); // Wednesday, which has no lessons

    expect(pickDefaultDay(timetable, now, WEEK_START)).toBe("Friday");
  });

  it("returns null when the week holds no lessons at all", () => {
    expect(pickDefaultDay(EMPTY, new Date(2026, 0, 7, 9, 0), WEEK_START)).toBeNull();
  });
});

describe("isWeekExhausted", () => {
  it("is false while a lesson remains today", () => {
    const timetable = timetableOf(HOURS, { Wednesday: ["Matematyka", "Polski", "WF"] });
    const now = new Date(2026, 0, 7, 9, 0);

    expect(isWeekExhausted(timetable, now, WEEK_START)).toBe(false);
  });

  it("is false when a later day still has lessons", () => {
    const timetable = timetableOf(HOURS, {
      Wednesday: ["Matematyka", null, null],
      Friday: ["Polski", null, null],
    });
    const now = new Date(2026, 0, 7, 10, 0); // Wednesday, finished

    expect(isWeekExhausted(timetable, now, WEEK_START)).toBe(false);
  });

  it("is true after the final lesson of the week's last teaching day", () => {
    const timetable = timetableOf(HOURS, {
      Monday: ["Matematyka", null, null],
      Friday: ["Polski", null, null],
    });
    const now = new Date(2026, 0, 9, 10, 0); // Friday, finished

    expect(isWeekExhausted(timetable, now, WEEK_START)).toBe(true);
  });

  it("is false on a weekend", () => {
    const timetable = timetableOf(HOURS, { Friday: ["Polski", null, null] });
    const now = new Date(2026, 0, 10, 12, 0); // Saturday

    expect(isWeekExhausted(timetable, now, WEEK_START)).toBe(false);
  });

  it("is false when now is in a different week", () => {
    const timetable = timetableOf(HOURS, { Friday: ["Polski", null, null] });
    const now = new Date(2026, 0, 16, 18, 0); // the following Friday

    expect(isWeekExhausted(timetable, now, WEEK_START)).toBe(false);
  });

  it("is false for a timetable with no lessons", () => {
    expect(isWeekExhausted(EMPTY, new Date(2026, 0, 9, 18, 0), WEEK_START)).toBe(false);
  });
});
