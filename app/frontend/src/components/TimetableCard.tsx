import { useEffect, useState } from "react";
import { Account, getTimetable, Timetable } from "../api";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { mondayOf, formatDate } from "../lib/week";
import {
  WEEK_DAYS,
  DAY_LABELS,
  lessonsFor,
  pickDefaultDay,
  isWeekExhausted,
} from "../lib/timetable";

const DAY_KEYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Saturday and Sunday are never school days, so the weekend points at the COMING Monday
// (+2 from Saturday, +1 from Sunday) — not the Monday of the week that is ending.
export function schoolDayFor(now: Date): { key: string; isToday: boolean; date: Date } {
  const day = now.getDay();
  if (day === 6 || day === 0) {
    const date = new Date(now);
    date.setDate(date.getDate() + (day === 6 ? 2 : 1));
    return { key: "Monday", isToday: false, date };
  }
  return { key: DAY_KEYS[day], isToday: true, date: new Date(now) };
}

export default function TimetableCard({ account }: { account: Account }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weekStart = mondayOf(schoolDayFor(new Date()).date);
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const from = formatDate(weekStart);
  const to = formatDate(weekEnd);

  useEffect(() => {
    setError(null);
    setTimetable(null);
    getTimetable(account.id, from, to)
      .then(setTimetable)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Nie udało się pobrać planu")
      );
  }, [account.id, from, to]);

  // Friday-evening case: everything in the loaded week is behind us, so jump
  // to next week once. Guarded on weekOffset === 0 so this can only ever fire
  // a single time — otherwise a freshly-fetched "exhausted" next week would
  // trigger this effect again and it would advance forever.
  useEffect(() => {
    if (!timetable || weekOffset !== 0) return;
    if (isWeekExhausted(timetable, new Date(), weekStart)) {
      setWeekOffset(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timetable, weekOffset]);

  const defaultDay = timetable ? pickDefaultDay(timetable, new Date(), weekStart) : null;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{account.label}</CardTitle>
        <span className="text-sm text-muted-foreground">
          {weekOffset === 0 ? "Ten tydzień" : "Następny tydzień"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !timetable && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {!error && timetable && defaultDay === null && (
          <p className="text-sm text-muted-foreground">Brak lekcji.</p>
        )}
        {!error && timetable && defaultDay !== null && (
          <Tabs defaultValue={defaultDay}>
            <TabsList>
              {WEEK_DAYS.map((day) => (
                <TabsTrigger
                  key={day}
                  value={day}
                  disabled={lessonsFor(timetable, day).length === 0}
                >
                  {DAY_LABELS[day]}
                </TabsTrigger>
              ))}
            </TabsList>
            {WEEK_DAYS.map((day) => {
              const lessons = lessonsFor(timetable, day);
              return (
                <TabsContent key={day} value={day} className="flex flex-col gap-2">
                  {lessons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Brak lekcji.</p>
                  ) : (
                    lessons.map(({ hour, lesson }) => (
                      <div key={hour} className="flex gap-3 text-sm">
                        <span className="w-28 shrink-0 text-muted-foreground">{hour}</span>
                        <span className="flex flex-col">
                          <span>{lesson!.subject}</span>
                          <span className="text-muted-foreground">
                            {lesson!.teacher} {lesson!.room}
                          </span>
                        </span>
                      </div>
                    ))
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
