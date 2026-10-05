import { useCallback, useEffect, useState } from "react";
import type { Filters, Sort } from "./filters";
import { load, save } from "./storage";

/** A named filter + sort combination the user saved on the Radar. */
export type SavedView = { id: string; name: string; filters: Filters; sort: Sort };

/** Radar preferences that live in this browser and travel with the tracking export. */
export type Prefs = {
  views: SavedView[];
  /** Company names whose jobs are hidden from the Radar. */
  hiddenCompanies: string[];
};

const KEY = "jobhunter.prefs.v1";
const EMPTY: Prefs = { views: [], hiddenCompanies: [] };

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...EMPTY, ...load<Partial<Prefs>>(KEY, {}) }));
  useEffect(() => save(KEY, prefs), [prefs]);

  const saveView = useCallback((name: string, filters: Filters, sort: Sort) => {
    const view: SavedView = { id: `v${Date.now().toString(36)}`, name: name.trim(), filters, sort };
    setPrefs((p) => ({ ...p, views: [...p.views, view] }));
    return view;
  }, []);
  const renameView = useCallback((id: string, name: string) => setPrefs((p) => ({ ...p, views: p.views.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)) })), []);
  const deleteView = useCallback((id: string) => setPrefs((p) => ({ ...p, views: p.views.filter((v) => v.id !== id) })), []);
  const setCompanyHidden = useCallback(
    (company: string, hidden: boolean) =>
      setPrefs((p) => ({ ...p, hiddenCompanies: hidden ? [...new Set([...p.hiddenCompanies, company])] : p.hiddenCompanies.filter((c) => c !== company) })),
    [],
  );
  const replacePrefs = useCallback((next: Partial<Prefs>) => setPrefs({ ...EMPTY, ...next }), []);

  return { prefs, saveView, renameView, deleteView, setCompanyHidden, replacePrefs };
}
