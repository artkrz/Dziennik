import { useEffect, useState } from "react";
import { Absences, Account, getAbsences } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/** Total absence marks across every semester bucket. */
export function countAbsences(data: Absences): number {
  return Object.values(data.semesters).reduce(
    (total, days) =>
      total + days.reduce((dayTotal, day) => dayTotal + day.table.filter(Boolean).length, 0),
    0
  );
}

export default function AbsencesCard({ account }: { account: Account }) {
  const [data, setData] = useState<Absences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    getAbsences(account.id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Błąd pobierania frekwencji"));
  }, [account.id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{account.label} — frekwencja</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !data && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {data && (
          <p className="text-2xl font-medium tabular-nums">
            {countAbsences(data)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">nieobecności</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
