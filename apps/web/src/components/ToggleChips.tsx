import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { cx } from "./ui";

type Props = {
  /** Every option, in display order. Selected values not listed here are shown too. */
  options: readonly string[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  label: string;
  tone?: "accent" | "bad" | "plain";
  /** Show a small input to add a value that isn't in the options. */
  addPlaceholder?: string;
  /** Display text for an option (defaults to the value). */
  format?: (v: string) => string;
  size?: "sm" | "md";
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The one select/deselect control: every option is always visible; selected ones are filled
 * with a check, and clicking any chip toggles it. Nothing disappears or locks once picked.
 */
export function ToggleChips({ options, selected, onChange, label, tone = "accent", addPlaceholder, format = (v) => v, size = "md" }: Props) {
  const [text, setText] = useState("");
  const all = [...options, ...selected.filter((s) => !options.includes(s))];
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  const add = () => {
    const v = norm(text);
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setText("");
  };
  const on = {
    accent: "border-accent bg-accent-subtle text-accent-text",
    bad: "border-danger/50 bg-danger-subtle text-danger-text",
    plain: "border-ink/30 bg-inset text-ink",
  }[tone];

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {all.map((v) => {
        const active = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(v)}
            className={cx(
              "inline-flex items-center gap-1 rounded-md border font-medium transition-colors",
              size === "sm" ? "h-7 px-2 type-meta" : "h-8 px-2.5 type-small",
              active ? on : "border-dashed border-line text-muted hover:border-accent hover:text-ink",
            )}
          >
            {active ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
            {format(v)}
          </button>
        );
      })}
      {addPlaceholder && (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={() => text.trim() && add()}
          placeholder={addPlaceholder}
          aria-label={`Add to ${label}`}
          className={cx(
            "min-w-36 flex-1 rounded-md border border-transparent bg-transparent px-2 type-small outline-none placeholder:text-muted focus:border-line",
            size === "sm" ? "h-7" : "h-8",
          )}
        />
      )}
    </div>
  );
}
