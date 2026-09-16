import { useEffect, useState } from "react";
import { Account, listAccounts } from "./api";
import AbsencesCard from "./components/AbsencesCard";
import AddAccountForm from "./components/AddAccountForm";
import AgendaCard from "./components/AgendaCard";
import AppDock, { View } from "./components/AppDock";
import GradesCard from "./components/GradesCard";
import MessagesCard from "./components/MessagesCard";
import TodayCard from "./components/TodayCard";
import { Alert, AlertDescription } from "./components/ui/alert";
import { BentoGrid } from "./components/ui/bento-grid";

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("calendar");

  useEffect(() => {
    listAccounts()
      .then(setAccounts)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Nie udało się załadować kont")
      )
      .finally(() => setLoading(false));
  }, []);

  function handleAdded(account: Account) {
    setAccounts((prev) => [...prev, account]);
    setView("calendar");
  }

  function handleDeleted(id: number) {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  if (loading) return <p className="text-sm text-muted-foreground">Ładowanie…</p>;

  return (
    <main className="flex flex-col gap-4 pb-28">
      <h1 className="font-heading text-2xl font-medium">Librus</h1>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {view === "add" && (
        <div className="max-w-sm">
          <AddAccountForm onAdded={handleAdded} />
        </div>
      )}

      {view === "calendar" &&
        (accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dodaj pierwsze konto Librus, żeby zobaczyć plan lekcji.
          </p>
        ) : (
          <BentoGrid className="grid-cols-1 auto-rows-auto md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <TodayCard key={account.id} account={account} onDeleted={handleDeleted} />
            ))}
          </BentoGrid>
        ))}

      {view === "messages" &&
        (accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dodaj pierwsze konto Librus, żeby zobaczyć wiadomości.
          </p>
        ) : (
          <BentoGrid className="grid-cols-1 auto-rows-auto md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <MessagesCard key={account.id} account={account} />
            ))}
          </BentoGrid>
        ))}

      {view === "grades" &&
        (accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dodaj pierwsze konto Librus, żeby zobaczyć oceny.
          </p>
        ) : (
          <BentoGrid className="grid-cols-1 auto-rows-auto md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <GradesCard key={account.id} account={account} />
            ))}
          </BentoGrid>
        ))}

      {view === "absences" &&
        (accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dodaj pierwsze konto Librus, żeby zobaczyć frekwencję.
          </p>
        ) : (
          <BentoGrid className="grid-cols-1 auto-rows-auto md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <AbsencesCard key={account.id} account={account} />
            ))}
          </BentoGrid>
        ))}

      {view === "agenda" &&
        (accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dodaj pierwsze konto Librus, żeby zobaczyć terminarz.
          </p>
        ) : (
          <BentoGrid className="grid-cols-1 auto-rows-auto md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => (
              <AgendaCard key={account.id} account={account} />
            ))}
          </BentoGrid>
        ))}

      <AppDock view={view} onChange={setView} />
    </main>
  );
}
