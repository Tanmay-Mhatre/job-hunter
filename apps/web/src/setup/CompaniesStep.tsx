import { useMemo } from "react";
import { ForYou } from "../components/companies/ForYou";
import { addCompanies, keyOf, type CompanyRef } from "../lib/companies";
import { useCompanySuggestions } from "../lib/companySuggest";
import type { Draft } from "../lib/setup";

/** Setup: pick companies to watch from ones that fit what you just told us (and your resume). */
export function CompaniesStep({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const state = useCompanySuggestions(draft);
  const watched = useMemo(() => new Set(draft.companies.map(keyOf)), [draft.companies]);
  const muted = useMemo(() => new Set(draft.muted), [draft.muted]);
  const addMany = (list: CompanyRef[]) => {
    const { patch, keys } = addCompanies(draft, list);
    if (patch) update(patch);
    return keys;
  };
  return (
    <div className="space-y-3">
      <ForYou
        compact
        state={state}
        watched={watched}
        muted={muted}
        pastEmployers={draft.pastEmployers}
        onPastEmployers={(pastEmployers) => update({ pastEmployers })}
        onAddMany={addMany}
        onRemoveMany={(keys) => update({ companies: draft.companies.filter((r) => !keys.includes(keyOf(r))) })}
        onMute={(key) => update({ muted: [...new Set([...draft.muted, key])] })}
        onUnmute={(key) => update({ muted: draft.muted.filter((k) => k !== key) })}
        offHint="Company suggestions need the local app (pnpm dev). You can add companies later in the Companies tab."
      />
      {draft.companies.length > 0 && (
        <p className="text-sm text-muted">
          <b className="text-fg">{draft.companies.length}</b> picked. We check them on every scan and list their jobs first.
        </p>
      )}
    </div>
  );
}
