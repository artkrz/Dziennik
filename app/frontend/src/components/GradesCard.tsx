import { useEffect, useState } from "react";
import { Account, getGrades, SubjectGrades } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/** Weighted-free arithmetic mean over the subjects that have one. */
export function overallAverage(subjects: SubjectGrades[]): number | null {
  const values = subjects.map((s) => s.average).filter((v) => Number.isFinite(v));
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export default function GradesCard({ account }: { account: Account }) {
  const [subjects, setSubjects] = useState<SubjectGrades[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    getGrades(account.id)
      .then(setSubjects)
      .catch((err) => setError(err instanceof Error ? err.message : "Błąd pobierania ocen"));
  }, [account.id]);

  const average = subjects ? overallAverage(subjects) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          <span>{account.label}</span>
          {average !== null && (
            <span className="text-sm font-normal text-muted-foreground">
              średnia {average.toFixed(2)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !subjects && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {subjects && subjects.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak ocen.</p>
        )}
        {subjects && subjects.length > 0 && (
          <ul className="flex flex-col gap-1">
            {subjects.map((subject) => (
              <li key={subject.name} className="flex justify-between gap-2 text-sm">
                <span className="truncate">{subject.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {Number.isFinite(subject.average) ? subject.average.toFixed(2) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
