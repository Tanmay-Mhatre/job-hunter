import { Check, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { keyOf, SUPPORTED, type CompanyRef } from "../lib/companies";
import { Button } from "./ui";

export function AddButton({ added, onAdd, onRemove, soon }: { added: boolean; onAdd: () => void; onRemove: () => void; soon?: boolean }) {
  return added ? (
    <Button size="sm" onClick={onRemove} aria-pressed className="border-accent bg-accent-soft text-accent">
      <Check className="size-3.5" /> Added
    </Button>
  ) : (
    <Button size="sm" variant={soon ? "outline" : "primary"} onClick={onAdd}>
      <Plus className="size-3.5" /> {soon ? "Add (coming soon)" : "Add"}
    </Button>
  );
}

/** "Add all (N)" for a list, then "Added N · Undo" until the list changes. */
export function AddAll({ items, watched, onAddMany, onRemoveMany }: { items: CompanyRef[]; watched: Set<string>; onAddMany: (c: CompanyRef[]) => string[]; onRemoveMany: (keys: string[]) => void }) {
  const [last, setLast] = useState<{ keys: string[]; soon: number } | null>(null);
  const todo = items.filter((c) => !watched.has(keyOf(c)));
  if (last && last.keys.some((k) => watched.has(k))) {
    const trackable = last.keys.length - last.soon;
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span>
          <Check className="mr-1 inline size-3.5 text-accent" />
          Added {last.keys.length}
          {last.soon > 0 && ` (${trackable} trackable now, ${last.soon} coming soon)`}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium text-accent"
          onClick={() => {
            onRemoveMany(last.keys);
            setLast(null);
          }}
        >
          <Undo2 className="size-3.5" /> Undo
        </button>
      </span>
    );
  }
  if (todo.length === 0) return null;
  return (
    <Button
      size="sm"
      onClick={() => {
        const keys = onAddMany(todo);
        const soon = todo.filter((c) => keys.includes(keyOf(c)) && !SUPPORTED.has(c.ats)).length;
        setLast({ keys, soon });
      }}
    >
      <Plus className="size-3.5" /> Add all ({todo.length})
    </Button>
  );
}
