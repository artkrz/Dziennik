import { useEffect, useState } from "react";
import { AgendaEvent, AgendaEventDetail, getAgendaEvent } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/** Label for each detail field, in display order. Absent fields are skipped. */
const FIELDS: [keyof AgendaEventDetail, string][] = [
  ["type", "Rodzaj"],
  ["subject", "Przedmiot"],
  ["teacher", "Nauczyciel"],
  ["date", "Data"],
  ["timespan", "Przedział czasu"],
  ["lessonNumber", "Nr lekcji"],
  ["room", "Sala"],
  ["description", "Opis"],
  ["added", "Data dodania"],
];

export default function AgendaEventDialog({
  accountId,
  event,
  open,
  onOpenChange,
}: {
  accountId: number;
  event: AgendaEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<AgendaEventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDetail(null);
    getAgendaEvent(accountId, event.id)
      .then(setDetail)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Nie udało się pobrać szczegółów")
      );
  }, [open, accountId, event.id]);

  const rows = detail
    ? FIELDS.filter(([key]) => detail[key] !== undefined && detail[key] !== "")
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription>{event.day}</DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !detail && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {detail && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak dodatkowych informacji.</p>
        )}
        {rows.length > 0 && (
          <dl className="flex flex-col gap-2 text-sm">
            {rows.map(([key, label]) => (
              <div key={key} className="flex gap-2">
                <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-wrap">{detail?.[key]}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
