import { useEffect, useState } from "react";
import { Account, AgendaEvent, getAgenda } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/** Events from today onward, soonest first. */
export function upcoming(events: AgendaEvent[], today: string): AgendaEvent[] {
  return events
    .filter((event) => event.day >= today)
    .sort((a, b) => a.day.localeCompare(b.day));
}

export default function AgendaCard({ account }: { account: Account }) {
  const [events, setEvents] = useState<AgendaEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAgenda(account.id)
      .then(setEvents)
      .catch((err) => setError(err instanceof Error ? err.message : "Błąd pobierania terminarza"));
  }, [account.id]);

  const today = new Date().toISOString().slice(0, 10);
  const list = events ? upcoming(events, today).slice(0, 6) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{account.label} — terminarz</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !list && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {list && list.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak nadchodzących wydarzeń.</p>
        )}
        {list && list.length > 0 && (
          <ul className="flex flex-col gap-1">
            {list.map((event) => (
              <li key={`${event.day}-${event.id}-${event.title}`} className="text-sm">
                <span className="text-muted-foreground tabular-nums">{event.day}</span>
                <span className="ml-2">{event.title}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
