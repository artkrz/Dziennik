import { cn } from "cn";
import { Account } from "../api";
import { Card, CardContent } from "./ui/card";

export default function ChildPicker({
  accounts,
  selectedId,
  onSelect,
}: {
  accounts: Account[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => (
        <Card
          key={account.id}
          role="button"
          tabIndex={0}
          aria-current={account.id === selectedId}
          onClick={() => onSelect(account.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelect(account.id);
            }
          }}
          className={cn(
            "cursor-pointer transition-colors",
            account.id === selectedId ? "border-primary" : "hover:border-muted-foreground/40"
          )}
        >
          <CardContent className="py-4">
            <p className="font-medium">{account.label}</p>
            <p className="text-sm text-muted-foreground">{account.login}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
