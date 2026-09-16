import { Timetable } from "../api";
import { formatDate, mondayOf } from "./week";

export const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
export type DayKey = (typeof WEEK_DAYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  Monday: "Pon",
  Tuesday: "Wt",
  Wednesday: "Śr",
  Thursday: "Czw",
  Friday: "Pt",
};

/** Minutes past midnight of a "07:25 - 08:10" slot's END, or null if unparseable. */
export function lessonEndMinutes(hour: string): number | null {
  const match = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(hour || "");
  if (!match) return null;
  return Number(match[3]) * 60 + Number(match[4]);
}

/** Slots that actually hold a lesson on this day, paired with their hour label. */
export function lessonsFor(timetable: Timetable, day: DayKey) {
  return timetable.hours
    .map((hour, index) => ({ hour, lesson: timetable.table[day]?.[index] ?? null }))
    .filter((row) => row.lesson !== null);
}

/** School days that have at least one lesson, in week order. */
export function daysWithLessons(timetable: Timetable): DayKey[] {
  return WEEK_DAYS.filter((day) => lessonsFor(timetable, day).length > 0);
}

/** Monday-based index of `now`, or null on a weekend. */
function weekdayIndex(now: Date): number | null {
  const day = now.getDay();
  return day >= 1 && day <= 5 ? day - 1 : null;
}

/** Is `now` inside the week that starts on `weekStart`? */
function isCurrentWeek(now: Date, weekStart: Date): boolean {
  return formatDate(mondayOf(now)) === formatDate(mondayOf(weekStart));
}

/**
 * Which day tab to open.
 *
 * Today while it still has a lesson that has not ended; otherwise the next
 * school day this week that has lessons; otherwise the first day with lessons
 * (the week is over, so show it from the start rather than blank).
 * Returns null when the week holds no lessons at all.
 */
export function pickDefaultDay(timetable: Timetable, now: Date, weekStart: Date): DayKey | null {
  const days = daysWithLessons(timetable);
  if (days.length === 0) return null;

  const index = isCurrentWeek(now, weekStart) ? weekdayIndex(now) : null;
  if (index === null) return days[0];

  const todayKey = WEEK_DAYS[index];
  if (days.includes(todayKey)) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const ends = lessonsFor(timetable, todayKey)
      .map((row) => lessonEndMinutes(row.hour))
      .filter((value): value is number => value !== null);
    // Still something to come today.
    if (ends.some((end) => end > nowMinutes)) return todayKey;
  }

  const later = days.find((day) => WEEK_DAYS.indexOf(day) > index);
  return later ?? days[0];
}

/**
 * True when `now` sits in this week, every day with lessons is behind us, and
 * today's lessons have ended - i.e. the caller should load the NEXT week.
 */
export function isWeekExhausted(timetable: Timetable, now: Date, weekStart: Date): boolean {
  const days = daysWithLessons(timetable);
  if (days.length === 0) return false;
  if (!isCurrentWeek(now, weekStart)) return false;
  const index = weekdayIndex(now);
  if (index === null) return false;

  const todayKey = WEEK_DAYS[index];
  if (days.includes(todayKey)) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const ends = lessonsFor(timetable, todayKey)
      .map((row) => lessonEndMinutes(row.hour))
      .filter((value): value is number => value !== null);
    if (ends.some((end) => end > nowMinutes)) return false;
  }
  return !days.some((day) => WEEK_DAYS.indexOf(day) > index);
}
