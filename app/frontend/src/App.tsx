import { useEffect, useState } from "react";
import { Account, listAccounts } from "./api";
import AbsencesCard from "./components/AbsencesCard";
import AgendaCard from "./components/AgendaCard";
import AppDock, { View } from "./components/AppDock";
import ChildPicker from "./components/ChildPicker";
import GradesCard from "./components/GradesCard";
import MessagesCard from "./components/MessagesCard";
import SettingsView from "./components/SettingsView";
import TodayCard from "./components/TodayCard";
import { Alert, AlertDescription } from "./components/ui/alert";

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    listAccounts()
      .then((list) => {
        setAccounts(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Nie udało się załadować kont")
      )
      .finally(() => setLoading(false));
  }, []);

  function handleSelect(id: number) {
    setSelectedId(id);
    setView("calendar");
  }

  function handleAdded(account: Account) {
    setAccounts((prev) => [...prev, account]);
    setSelectedId((current) => current ?? account.id);
  }

  function handleUpdated(account: Account) {
    setAccounts((prev) => prev.map((a) => (a.id === account.id ? account : a)));
  }

  function handleDeleted(id: number) {
    setAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      setSelectedId((current) => (current === id ? next[0]?.id ?? null : current));
      return next;
    });
  }

  const selected = accounts.find((a) => a.id === selectedId) ?? null;

  function contentView(node: React.ReactNode) {
    if (accounts.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          Dodaj pierwsze dziecko w ustawieniach, żeby zobaczyć dane.
        </p>
      );
    }
    if (!selected) {
      return <p className="text-sm text-muted-foreground">Wybierz dziecko na stronie głównej.</p>;
    }
    return node;
  }

  if (loading) return <p className="text-sm text-muted-foreground">Ładowanie…</p>;

  return (
    <main className="flex flex-col gap-4 pb-28">
      <h1 className="font-heading text-2xl font-medium">
        Librus{selected && view !== "home" && view !== "settings" ? ` — ${selected.label}` : ""}
      </h1>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {view === "home" &&
        (accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Dodaj pierwsze dziecko w ustawieniach.
          </p>
        ) : (
          <ChildPicker accounts={accounts} selectedId={selectedId} onSelect={handleSelect} />
        ))}

      {view === "calendar" &&
        contentView(
          selected && <TodayCard account={selected} onDeleted={handleDeleted} />
        )}

      {view === "messages" &&
        contentView(selected && <MessagesCard account={selected} />)}

      {view === "grades" &&
        contentView(selected && <GradesCard account={selected} />)}

      {view === "absences" &&
        contentView(selected && <AbsencesCard account={selected} />)}

      {view === "agenda" &&
        contentView(selected && <AgendaCard account={selected} />)}

      {view === "settings" && (
        <SettingsView
          accounts={accounts}
          onAdded={handleAdded}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}

      <AppDock view={view} onChange={setView} />
    </main>
  );
}
