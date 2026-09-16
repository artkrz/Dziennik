import { useEffect, useState } from "react";
import { Account, listThreads, MessageThread } from "../api";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import ThreadDialog from "./ThreadDialog";

export default function MessagesCard({ account }: { account: Account }) {
  const [threads, setThreads] = useState<MessageThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MessageThread | null>(null);

  useEffect(() => {
    setError(null);
    listThreads(account.id)
      .then(setThreads)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Nie udało się pobrać wiadomości")
      );
  }, [account.id]);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{account.label}</CardTitle>
      </CardHeader>
      <CardContent className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!error && !threads && <p className="text-sm text-muted-foreground">Ładowanie…</p>}
        {!error && threads && threads.length === 0 && (
          <p className="text-sm text-muted-foreground">Brak wiadomości.</p>
        )}
        {threads?.map((thread) => (
          <button
            key={thread.key}
            type="button"
            onClick={() => setSelected(thread)}
            className="flex flex-col rounded-md p-1 text-left text-sm transition-colors hover:bg-muted/50"
          >
            <span className={thread.unread ? "font-medium" : ""}>
              {thread.subject}
              {thread.messageCount > 1 && (
                <span className="ml-1 text-muted-foreground">({thread.messageCount})</span>
              )}
            </span>
            <span className="text-muted-foreground">
              {thread.participants.join(" · ")} · {thread.lastDate}
            </span>
          </button>
        ))}
        {selected && (
          <ThreadDialog
            key={selected.key}
            accountId={account.id}
            thread={selected}
            open={selected !== null}
            onOpenChange={(next) => !next && setSelected(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}
