import { useEffect, useState } from "react";
import { Account, updateAccount } from "../api";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function EditAccountDialog({
  account,
  open,
  onOpenChange,
  onUpdated,
}: {
  account: Account;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (account: Account) => void;
}) {
  const [label, setLabel] = useState(account.label);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(account.label);
    setPassword("");
    setError(null);
  }, [open, account.label]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await updateAccount(account.id, label, password || undefined);
      onUpdated(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać zmian");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edytuj konto</DialogTitle>
          <DialogDescription>Zmień etykietę lub hasło Synergia.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label">Etykieta</Label>
            <Input id="edit-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-login">Login Synergia</Label>
            <Input id="edit-login" value={account.login} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-password">Nowe hasło</Label>
            <Input
              id="edit-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Zostaw puste, żeby nie zmieniać"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
