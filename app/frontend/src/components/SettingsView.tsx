import { useState } from "react";
import { Account, deleteAccount } from "../api";
import AddAccountForm from "./AddAccountForm";
import EditAccountDialog from "./EditAccountDialog";
import ThemeSetting from "./ThemeSetting";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export default function SettingsView({
  accounts,
  onAdded,
  onUpdated,
  onDeleted,
}: {
  accounts: Account[];
  onAdded: (account: Account) => void;
  onUpdated: (account: Account) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState<Account | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(account: Account) {
    if (!window.confirm(`Usunąć konto ${account.label}?`)) return;
    setError(null);
    try {
      await deleteAccount(account.id);
      onDeleted(account.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się usunąć konta");
    }
  }

  function handleAdded(account: Account) {
    onAdded(account);
    setAddOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Wygląd</h2>
        <ThemeSetting />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">Nie masz jeszcze żadnych dzieci.</p>
      )}

      {accounts.length > 0 && (
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">{account.label}</span>
                <span className="text-sm text-muted-foreground">{account.login}</span>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(account)}>
                  Edytuj
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(account)}>
                  Usuń
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button size="lg" className="w-full" onClick={() => setAddOpen(true)}>
        Dodaj dziecko
      </Button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Dodaj dziecko</DialogTitle>
            <DialogDescription>Podaj dane logowania do Synergii.</DialogDescription>
          </DialogHeader>
          <AddAccountForm onAdded={handleAdded} />
        </DialogContent>
      </Dialog>

      {editing && (
        <EditAccountDialog
          account={editing}
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onUpdated={onUpdated}
        />
      )}
    </div>
  );
}
