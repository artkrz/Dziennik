import { useState } from "react";
import { getMessage, MessageDetail, MessageThread, ThreadMessage } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import { Bubble, BubbleContent, BubbleGroup } from "./ui/bubble";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

// Fetching a message body marks it read on Librus's servers. A bubble
// therefore starts collapsed and its body is only ever requested from the
// click handler below - never on mount, never for the whole thread at once.
// Loading every body eagerly would silently mark a whole conversation read
// the moment the dialog opened.
function ThreadBubble({
  accountId,
  message,
  detail,
  error,
  loading,
  onLoad,
}: {
  accountId: number;
  message: ThreadMessage;
  detail: MessageDetail | undefined;
  error: string | undefined;
  loading: boolean;
  onLoad: () => void;
}) {
  const align = message.direction === "out" ? "end" : "start";
  const variant = message.direction === "out" ? "default" : "secondary";

  return (
    <Bubble align={align} variant={variant}>
      <BubbleContent>
        <div className="flex flex-col gap-0.5">
          {/* Inherit the bubble's own foreground rather than a fixed token:
              the two variants sit on opposite backgrounds, so anything
              absolute (text-muted-foreground, text-primary) is unreadable on
              one side of the conversation in one theme or the other. */}
          <span className="text-xs opacity-70">
            {message.user || "Ja"} · {message.date}
          </span>
          {detail && <p className="text-sm whitespace-pre-wrap">{detail.content}</p>}
          {error && (
            <Alert variant="destructive" className="mt-1">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!detail && !error && (
            <button
              type="button"
              className="self-start text-xs underline underline-offset-4 opacity-80 transition-opacity hover:opacity-100 disabled:opacity-50"
              disabled={loading}
              onClick={onLoad}
            >
              {loading ? "Wczytywanie…" : "Pokaż treść"}
            </button>
          )}
        </div>
      </BubbleContent>
    </Bubble>
  );
}

export default function ThreadDialog({
  accountId,
  thread,
  open,
  onOpenChange,
}: {
  accountId: number;
  thread: MessageThread;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [details, setDetails] = useState<Record<number, MessageDetail>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [loadingIds, setLoadingIds] = useState<Record<number, boolean>>({});

  function loadBody(message: ThreadMessage) {
    setLoadingIds((prev) => ({ ...prev, [message.id]: true }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[message.id];
      return next;
    });

    getMessage(accountId, message.id, message.folder === "sent" ? "sent" : undefined)
      .then((detail) => {
        setDetails((prev) => ({ ...prev, [message.id]: detail }));
      })
      .catch((err) => {
        setErrors((prev) => ({
          ...prev,
          [message.id]: err instanceof Error ? err.message : "Nie udało się pobrać wiadomości",
        }));
      })
      .finally(() => {
        setLoadingIds((prev) => ({ ...prev, [message.id]: false }));
      });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{thread.subject}</DialogTitle>
          <DialogDescription>{thread.participants.join(" · ")}</DialogDescription>
        </DialogHeader>
        <BubbleGroup>
          {thread.messages.map((message) => (
            <ThreadBubble
              key={message.id}
              accountId={accountId}
              message={message}
              detail={details[message.id]}
              error={errors[message.id]}
              loading={loadingIds[message.id] === true}
              onLoad={() => loadBody(message)}
            />
          ))}
        </BubbleGroup>
      </DialogContent>
    </Dialog>
  );
}
