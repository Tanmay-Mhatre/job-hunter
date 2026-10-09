import { matchesTerm } from "@rawjobs/core/text";
import { COUNTRIES, countryTerms, groupPlaces, REGIONS, searchPlaces } from "@rawjobs/core/catalog/places";
import { INDUSTRY_BY_ID } from "@rawjobs/core/catalog/industries";
import { allTitles, COMMON_EXCLUDES, ROLE_FAMILIES, SENIORITY, type RoleFamily } from "@rawjobs/core/catalog/roles";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Combobox, type ComboItem } from "../components/Combobox";
import { ToggleChips } from "../components/ToggleChips";
import { Button, cx, Toggle } from "../components/ui";
import { displayPlace } from "../lib/format";
import type { Suggestions } from "../lib/suggest";
import { inferFamily, type Draft } from "../lib/setup";
import { CV_DICTIONARY, KEYWORD_PACKS, REMOTE_EXCLUDE_SUGGESTIONS } from "./presets";

export type StepProps = { draft: Draft; update: (patch: Partial<Draft>) => void; suggest?: Suggestions };

/** Heading level for section titles inside a step: 2 under the wizard's h1, 3 under a Settings h2. */
export const HeadingLevel = createContext<2 | 3>(3);
function SectionHeading({ children }: { children: ReactNode }) {
  const H = useContext(HeadingLevel) === 2 ? "h2" : "h3";
  return <H className="type-small font-semibold">{children}</H>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <SectionHeading>{label}</SectionHeading>
        {hint && <p className="mt-0.5 type-small text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function PickButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 type-label transition-colors",
        active ? "border-accent bg-accent-subtle text-accent-text" : "border-line bg-raised hover:bg-inset",
      )}
    >
      {active && <Check className="size-4" />}
      {children}
    </button>
  );
}

const union = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.includes(x))];
const hasAll = (a: string[], b: string[]) => b.every((x) => a.includes(x));

// ---------- 2. Roles ----------

const TITLE_INDEX = allTitles();
const RESUME_LABEL = (s?: Suggestions) => (s?.source === "ai" ? "From your master resume" : "From your resume");
const FAMILY_DEFAULT_TITLES = 6;

/** What a family starts with: titles from the resume that belong to it, else its most common ones. */
function familyDefaults(f: RoleFamily, suggest?: Suggestions) {
  const fromResume = (suggest?.titles ?? []).filter((t) => f.titles.includes(t));
  return {
    // Resume matches first, topped up with the family's most common titles.
    include: union(fromResume, f.titles).slice(0, Math.max(FAMILY_DEFAULT_TITLES, fromResume.length)),
    exclude: union(f.exclude, union(suggest?.exclude ?? [], ["intern", "junior"])),
  };
}

/** Secondary settings, collapsed until wanted. The summary says what's inside without opening it. */
export function MoreOptions({ summary, children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 type-label">
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
        More options
        {summary && <span className="ml-auto truncate pl-2 font-normal text-muted">{summary}</span>}
      </summary>
      <div className="space-y-6 border-t border-line p-3 sm:p-4">{children}</div>
    </details>
  );
}

function Section({ n, title, hint, action, children }: { n: number; title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm bg-accent-subtle type-meta font-semibold text-accent-text">{n}</span>
        <div className="min-w-[14rem] flex-1">
          <SectionHeading>{title}</SectionHeading>
          {hint && <p className="mt-0.5 type-small text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="sm:pl-8">{children}</div>
    </section>
  );
}

export function RolesStep({ draft, update, suggest }: StepProps) {
  const fam = ROLE_FAMILIES.find((f) => f.id === draft.family);
  const [choosing, setChoosing] = useState(!fam);
  const [query, setQuery] = useState("");
  const [undo, setUndo] = useState<{ family?: string; include: string[]; exclude: string[]; to: string } | null>(null);

  const famTitles = fam?.titles ?? [];
  const extras = draft.include.filter((t) => !famTitles.includes(t));
  const otherOptions = union((suggest?.titles ?? []).filter((t) => !famTitles.includes(t)), extras);
  const q = query.trim().toLowerCase();
  const families = ROLE_FAMILIES.filter((f) => !q || f.label.toLowerCase().includes(q) || f.titles.some((t) => t.includes(q)));
  const suggestedFamily = !fam && suggest?.titles.length ? ROLE_FAMILIES.find((f) => f.titles.some((t) => suggest.titles.includes(t)))?.id : undefined;

  const pickFamily = (id: string) => {
    setChoosing(false);
    setQuery("");
    if (id === draft.family) return;
    const next = ROLE_FAMILIES.find((f) => f.id === id)!;
    const d = familyDefaults(next, suggest);
    if (draft.include.length || draft.exclude.length) setUndo({ family: draft.family, include: draft.include, exclude: draft.exclude, to: next.label });
    else setUndo(null);
    update({ family: id, include: d.include, exclude: d.exclude });
  };

  const search = useCallback(
    (text: string): ComboItem[] => {
      const s = text.trim().toLowerCase();
      return TITLE_INDEX.filter((t) => t.title.includes(s) || t.families.some((f) => f.toLowerCase().includes(s)))
        .filter((t) => !draft.include.includes(t.title))
        // Title starts with it, then contains it, then only its family matches.
        .sort((a, b) => {
          const rank = (t: string) => (t.startsWith(s) ? 0 : matchesTerm(t, s) ? 1 : t.includes(s) ? 2 : 3);
          return rank(a.title) - rank(b.title) || a.title.length - b.title.length;
        })
        .slice(0, 30)
        .map((t) => ({ key: t.title, label: t.title, hint: t.families.join(" · ") }));
    },
    [draft.include],
  );

  return (
    <div className="space-y-8">
      <Section
        n={1}
        title="Job family"
        hint={undefined}
        action={
          fam && !choosing ? (
            <Button size="sm" onClick={() => setChoosing(true)}>
              Change
            </Button>
          ) : undefined
        }
      >
        {fam && !choosing ? (
          <div className="flex items-center gap-2 rounded-md border border-accent bg-accent-subtle/40 px-3 py-2.5">
            <Check className="size-4 text-accent-text" />
            <span className="font-semibold">{fam.label}</span>
            <span className="type-small text-muted">· {fam.titles.length} titles</span>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter families, e.g. product, risk, sales…"
              aria-label="Filter job families"
              className="h-10 w-full rounded-md border border-line bg-raised px-3 type-small outline-none placeholder:text-muted focus:border-accent"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {families.map((f) => {
                const active = f.id === draft.family;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickFamily(f.id)}
                    className={cx(
                      "flex items-center gap-2 rounded-md border px-3 py-2.5 text-left transition-colors",
                      active ? "border-accent bg-accent-subtle/50" : "border-line hover:bg-inset",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block type-small font-semibold">{f.label}</span>
                      <span className="block type-meta text-muted">
                        {f.titles.length} titles{f.id === suggestedFamily ? " · matches your resume" : ""}
                      </span>
                    </span>
                    {active && <Check className="size-4 shrink-0 text-accent-text" />}
                  </button>
                );
              })}
              {families.length === 0 && <p className="type-small text-muted">No family matches “{query}”. Use the title search in the next section instead.</p>}
            </div>
            {fam && (
              <button type="button" className="type-label text-muted hover:text-ink" onClick={() => setChoosing(false)}>
                Keep {fam.label}
              </button>
            )}
          </div>
        )}
        {undo && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-inset px-3 py-2 type-small">
            <span className="flex-1 text-muted">Switched to {undo.to}: titles and exclusions were reset to its defaults.</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                update({ family: undo.family, include: undo.include, exclude: undo.exclude });
                setUndo(null);
              }}
            >
              Undo
            </Button>
          </div>
        )}
      </Section>

      <Section
        n={2}
        title={fam ? `Titles in ${fam.label}` : "Job titles"}
        hint={undefined}
        action={
          fam ? (
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={() => update({ include: union(fam.titles, extras) })} disabled={hasAll(draft.include, fam.titles)}>
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => update({ include: extras })} disabled={!draft.include.some((t) => famTitles.includes(t))}>
                Clear
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {fam ? (
            <ToggleChips
              label={`Titles in ${fam.label}`}
              options={fam.titles}
              selected={draft.include.filter((t) => famTitles.includes(t))}
              onChange={(next) => update({ include: [...next, ...extras] })}
            />
          ) : (
            !draft.include.length && <p className="type-small text-muted">Pick a job family above, or search for titles below.</p>
          )}
          {otherOptions.length > 0 && (
            <div>
              <p className="mb-1.5 type-meta font-medium text-muted">{fam ? "Other titles" : "Your titles"}{suggest?.titles.length ? ` (incl. ${RESUME_LABEL(suggest).toLowerCase()})` : ""}</p>
              <ToggleChips
                label="Other titles"
                options={otherOptions}
                selected={extras}
                onChange={(next) => update({ include: [...draft.include.filter((t) => famTitles.includes(t)), ...next] })}
              />
            </div>
          )}
          <div>
            <p className="mb-1.5 type-meta font-medium text-muted">Add a title from any family</p>
            <Combobox
              label="Search job titles"
              placeholder={`Search ${TITLE_INDEX.length}+ titles, or type your own…`}
              search={search}
              onPick={(i) => update({ include: union(draft.include, [i.key]) })}
              onFreeText={(t) => update({ include: union(draft.include, [t]) })}
            />
          </div>
        </div>
      </Section>

      <MoreOptions summary={[draft.exclude.length && `${draft.exclude.length} hidden`, draft.seniority.length && `${draft.seniority.length} seniority`].filter(Boolean).join(" · ")}>
        <Field label="Never show me" hint="Hide titles with these words.">
        <ToggleChips
          label="Titles to hide"
          tone="bad"
          options={union(union(fam?.exclude ?? [], suggest?.exclude ?? []), COMMON_EXCLUDES)}
          selected={draft.exclude}
          onChange={(exclude) => update({ exclude })}
          addPlaceholder="Add another…"
        />
        </Field>
        <Field label="Seniority" hint="Titles with these words rank higher.">
        <ToggleChips
          label="Seniority words"
          tone="plain"
          options={union(union(suggest?.seniority ?? [], SENIORITY), draft.seniority)}
          selected={draft.seniority}
          onChange={(seniority) => update({ seniority })}
          addPlaceholder="Add another…"
        />
        </Field>
      </MoreOptions>
    </div>
  );
}

// ---------- 3. Locations ----------

const POPULAR_COUNTRIES = [
  "united arab emirates",
  "saudi arabia",
  "qatar",
  "united kingdom",
  "united states",
  "india",
  "singapore",
  "germany",
  "netherlands",
  "canada",
  "australia",
];
const QUICK_REGIONS = ["emea", "europe", "mena", "gcc", "north america", "latam", "apac", "asia", "africa"];
const countryByName = new Map(COUNTRIES.map((c) => [c.name, c]));
const regionByName = new Map(REGIONS.map((r) => [r.name, r]));
const titleCase = displayPlace;
const ACRONYMS = new Set(["emea", "mena", "gcc", "apac", "latam", "dach", "cee", "anz", "amer", "eu"]);
const regionLabel = (name: string) => (ACRONYMS.has(name) ? name.toUpperCase() : titleCase(name));
/** Display form of any place term: regions like "emea" in capitals, everything else title-cased. */
export const placeLabel = (term: string) => (regionByName.has(term) ? regionLabel(term) : displayPlace(term));

function placeItems(q: string, opts: { regions: boolean; remote: boolean }): ComboItem[] {
  return searchPlaces(q, 14)
    .filter((h) => opts.regions || h.kind !== "region")
    .map((h): ComboItem => {
      if (h.kind === "country") {
        const extra = h.country.aliases.length ? ` (${h.country.aliases.slice(0, 2).join(", ")})` : "";
        return {
          key: `country:${h.country.name}`,
          label: opts.remote ? `Remote in ${titleCase(h.country.name)}` : titleCase(h.country.name) + extra,
          hint: opts.remote ? "country" : `country · ${h.country.cities.length} cities: ${h.country.cities.slice(0, 3).join(", ")}…`,
        };
      }
      if (h.kind === "city") return { key: `city:${h.city}`, label: titleCase(h.city), hint: `city · ${titleCase(h.country.name)}` };
      return { key: `region:${h.region.name}`, label: regionLabel(h.region.name), hint: h.region.hint };
    });
}

/** Terms a picked item adds: a country brings its aliases (and cities, for offices). */
function termsFor(key: string, withCities: boolean): string[] {
  const kind = key.slice(0, key.indexOf(":"));
  const name = key.slice(key.indexOf(":") + 1);
  if (kind === "country") {
    const c = countryByName.get(name);
    return c ? countryTerms(c, withCities) : [name];
  }
  if (kind === "region") {
    const r = regionByName.get(name);
    return r ? [r.name, ...r.aliases] : [name];
  }
  return [name];
}

/** Every term a country or region could have added, so turning it off removes all of them. */
function allTermsFor(key: string): string[] {
  return termsFor(key, true);
}

/**
 * Selected places shown as one chip per country/region (not one per city or alias).
 * × removes the whole group; clicking a group lets you deselect single cities or names.
 */
function GroupedPlaces({ terms, onChange, label, remote }: { terms: string[]; onChange: (t: string[]) => void; label: string; remote?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups = groupPlaces(terms);
  if (!groups.length) return <p className="type-small text-muted">Nothing selected yet.</p>;
  const openGroup = groups.find((g) => g.key === open);
  return (
    <div className="space-y-2">
      <div role="list" aria-label={label} className="flex flex-wrap gap-1.5">
        {groups.map((g) => {
          // Only cities picked (not the country itself): name the cities, e.g. "Riyadh · Saudi Arabia".
          const citiesOnly = g.kind === "country" && !g.terms.includes(g.name) && g.terms.length <= 2;
          const name =
            g.kind === "region"
              ? regionLabel(g.name)
              : citiesOnly
                ? `${g.terms.map(titleCase).join(", ")} · ${titleCase(g.name)}`
                : g.kind === "country"
                  ? remote
                    ? `Remote in ${titleCase(g.name)}`
                    : titleCase(g.name)
                  : g.name === "remote"
                    ? "Anywhere"
                    : titleCase(g.name);
          const expandable = g.options.length > 1;
          return (
            <span
              key={g.key}
              role="listitem"
              className={cx(
                "inline-flex h-8 items-center rounded-md border type-label",
                open === g.key ? "border-accent bg-accent-subtle text-accent-text" : "border-accent/50 bg-accent-subtle/60 text-accent-text",
              )}
            >
              <button
                type="button"
                disabled={!expandable}
                onClick={() => setOpen(open === g.key ? null : g.key)}
                aria-expanded={expandable ? open === g.key : undefined}
                className="flex h-full items-center gap-1 pl-2.5 pr-1 disabled:cursor-default"
                title={g.terms.join(", ")}
              >
                {name}
                {expandable && !citiesOnly && <span className="type-meta">· {g.terms.length}/{g.options.length}</span>}
                {expandable && <ChevronDown className={cx("size-3.5 transition-transform", open === g.key && "rotate-180")} />}
              </button>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  onChange(terms.filter((t) => !g.terms.includes(t)));
                  if (open === g.key) setOpen(null);
                }}
                className="flex h-full items-center rounded-r-md px-1.5 opacity-70 hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </span>
          );
        })}
      </div>
      {openGroup && (
        <div className="rounded-md border border-line bg-inset/40 p-3">
          <p className="mb-2 type-meta text-muted">
            Words matched for <b className="text-ink">{titleCase(openGroup.name)}</b>. Deselect any you don't want.
          </p>
          <ToggleChips
            size="sm"
            label={`Terms for ${openGroup.name}`}
            options={openGroup.options}
            selected={openGroup.terms}
            format={titleCase}
            onChange={(next) => onChange([...terms.filter((t) => !openGroup.options.includes(t)), ...next])}
          />
        </div>
      )}
    </div>
  );
}

/** The country this browser is set to (from its language, e.g. en-GB), if it's in the catalogue. */
function localeCountry(): string | undefined {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const name = region && new Intl.DisplayNames(["en"], { type: "region" }).of(region)?.toLowerCase();
    return name && countryByName.has(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Short codes in capitals ("US", "UAE"), everything else title-cased. */
const termLabel = (t: string) => (t.length <= 3 ? t.toUpperCase() : placeLabel(t));

const WORK_STYLES = [
  { id: "onsite", label: "On-site" },
  { id: "hybrid", label: "Hybrid" },
  { id: "remote", label: "Remote" },
] as const;

export function LocationsStep({ draft, update, suggest }: StepProps) {
  const [withCities, setWithCities] = useState(true);
  const officeSearch = useCallback((q: string) => placeItems(q, { regions: false, remote: false }), []);
  const remoteSearch = useCallback((q: string) => placeItems(q, { regions: true, remote: true }), []);
  const officeGroups = new Set(groupPlaces(draft.places).map((g) => g.key));
  const remoteGroups = new Set(groupPlaces(draft.remoteOk).map((g) => g.key));
  // Your own country first, then the usual list.
  const popular = useMemo(() => union([localeCountry()].filter((c): c is string => !!c), POPULAR_COUNTRIES), []);
  const office = draft.office.length > 0;

  /** Quick toggle: on adds the group's terms, off removes every term the group could have added. */
  const toggleGroup = (list: "places" | "remoteOk", key: string, add: string[]) => {
    const current = draft[list];
    const isOn = (list === "places" ? officeGroups : remoteGroups).has(key) || (key.startsWith("term:") && current.includes(key.slice(5)));
    const all = key.startsWith("term:") ? [key.slice(5)] : allTermsFor(key);
    update({ [list]: isOn ? current.filter((t) => !all.includes(t)) : union(current, add) } as Partial<Draft>);
  };

  const toggleStyle = (id: (typeof WORK_STYLES)[number]["id"]) => {
    if (id === "remote") return update({ remote: !draft.remote });
    update({ office: draft.office.includes(id) ? draft.office.filter((o) => o !== id) : [...draft.office, id] });
  };

  return (
    <div className="space-y-8">
      <Field label="Work style">
        <div className="flex flex-wrap gap-2">
          {WORK_STYLES.map((w) => (
            <PickButton key={w.id} active={w.id === "remote" ? draft.remote : draft.office.includes(w.id)} onClick={() => toggleStyle(w.id)}>
              {w.label}
            </PickButton>
          ))}
        </div>
      </Field>

      {office && (
        <Field label={draft.office.length === 2 ? "Office locations" : draft.office[0] === "hybrid" ? "Hybrid locations" : "On-site locations"}>
          <Combobox
            label="Search places"
            placeholder="City or country, e.g. Dubai, London…"
            search={officeSearch}
            onPick={(i) => update({ places: union(draft.places, termsFor(i.key, withCities)) })}
            onFreeText={(t) => update({ places: union(draft.places, [t]) })}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {popular.map((name) => {
              const key = `country:${name}`;
              const active = officeGroups.has(key);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleGroup("places", key, countryTerms(countryByName.get(name)!, withCities))}
                  className={cx(
                    "inline-flex h-7 items-center gap-1 rounded-md border px-2 type-meta font-medium",
                    active ? "border-accent bg-accent-subtle text-accent-text" : "border-dashed border-line text-muted hover:border-accent hover:text-ink",
                  )}
                >
                  {active ? <Check className="size-3" /> : <Plus className="size-3" />}
                  {titleCase(name)}
                </button>
              );
            })}
          </div>
          {suggest?.places.length ? (
            <div>
              <p className="mb-1.5 type-meta font-medium text-muted">{RESUME_LABEL(suggest)}</p>
              <ToggleChips
                size="sm"
                label="Places from your resume"
                options={suggest.places}
                selected={draft.places.filter((p) => suggest.places.includes(p))}
                format={titleCase}
                onChange={(next) => update({ places: [...draft.places.filter((p) => !suggest.places.includes(p)), ...next] })}
              />
            </div>
          ) : null}
          {draft.places.length > 0 && <GroupedPlaces label="Selected places" terms={draft.places} onChange={(places) => update({ places })} />}
        </Field>
      )}

      {draft.remote && (
        <Field label="Remote from">
          <Combobox
            label="Search remote regions"
            placeholder="Region or country, e.g. EMEA, Germany…"
            search={remoteSearch}
            onPick={(i) => update({ remoteOk: union(draft.remoteOk, termsFor(i.key, false)) })}
            onFreeText={(t) => update({ remoteOk: union(draft.remoteOk, [t]) })}
          />
          <div className="flex flex-wrap gap-1.5">
            {[{ key: "term:remote", label: "Anywhere", add: ["remote"] }, ...QUICK_REGIONS.map((r) => ({ key: `region:${r}`, label: regionLabel(r), add: termsFor(`region:${r}`, false) }))].map((g) => {
              const active = g.key === "term:remote" ? draft.remoteOk.includes("remote") : remoteGroups.has(g.key);
              return (
                <PickButton key={g.key} active={active} onClick={() => toggleGroup("remoteOk", g.key, g.add)}>
                  {g.label}
                </PickButton>
              );
            })}
          </div>
          {suggest?.remoteRegions.length ? (
            <div>
              <p className="mb-1.5 type-meta font-medium text-muted">{RESUME_LABEL(suggest)}</p>
              <ToggleChips
                size="sm"
                label="Remote regions from your resume"
                options={suggest.remoteRegions}
                selected={draft.remoteOk.filter((p) => suggest.remoteRegions.includes(p))}
                format={regionLabel}
                onChange={(next) => update({ remoteOk: [...draft.remoteOk.filter((p) => !suggest.remoteRegions.includes(p)), ...next] })}
              />
            </div>
          ) : null}
          {draft.remoteOk.length > 0 && <GroupedPlaces label="Selected remote regions" remote terms={draft.remoteOk} onChange={(remoteOk) => update({ remoteOk })} />}
        </Field>
      )}

      <MoreOptions summary={draft.remote && draft.remoteExclude.length ? `${draft.remoteExclude.length} remote limits skipped` : undefined}>
        <Toggle checked={withCities} onChange={setWithCities}>
          When I pick a country, also add its main cities
        </Toggle>
        {draft.remote && (
          <Field label="Skip remote jobs limited to" hint="For example “Remote (US only)”.">
            <ToggleChips
              label="Remote regions to skip"
              tone="bad"
              options={REMOTE_EXCLUDE_SUGGESTIONS}
              selected={draft.remoteExclude}
              onChange={(remoteExclude) => update({ remoteExclude })}
              format={termLabel}
              addPlaceholder="Add another…"
            />
          </Field>
        )}
      </MoreOptions>
    </div>
  );
}

// ---------- Industries ----------

// Broadest first, so someone outside finance doesn't open on a list of trading niches.
const INDUSTRY_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Tech & other", ids: ["ai", "devtools", "cybersecurity", "ecommerce", "gaming", "media", "mobility", "travel", "healthtech", "edtech", "proptech"] },
  { label: "Payments & banking", ids: ["payments", "digital-bank", "banking", "lending", "fintech", "regtech", "insurtech"] },
  { label: "Trading, crypto & investing", ids: ["crypto-exchange", "crypto", "brokerage", "trading-tech", "market-making", "digital-assets", "tokenization", "wealth"] },
];
const industryLabel = (id: string) => INDUSTRY_BY_ID.get(id)?.label ?? id;

/** Industries that fit the resume or the chosen roles and topics, for ordering the groups. */
function relevantIndustries(draft: Draft, fromResume: string[]): Set<string> {
  const text = [...draft.include, ...Object.keys(draft.keywords)].join(" ; ");
  const out = new Set([...fromResume, ...draft.industries]);
  for (const g of INDUSTRY_GROUPS)
    for (const id of g.ids) if (text && INDUSTRY_BY_ID.get(id)?.terms.some((t) => matchesTerm(text, t))) out.add(id);
  return out;
}

export function IndustriesStep({ draft, update, suggest }: StepProps) {
  const [q, setQ] = useState("");
  const fromResume = (suggest?.industries ?? []).filter((id) => INDUSTRY_BY_ID.has(id));
  const query = q.trim().toLowerCase();
  const matches = (id: string) => {
    const ind = INDUSTRY_BY_ID.get(id);
    return !query || !ind || ind.label.toLowerCase().includes(query) || ind.terms.some((t) => t.includes(query)) || id.includes(query);
  };
  // Topics the picked industries suggest, for the next step.
  const topics = [...new Set(draft.industries.flatMap((id) => INDUSTRY_BY_ID.get(id)?.topics ?? []))].filter((t) => !(t in draft.keywords));
  const [showAll, setShowAll] = useState(false);
  // Groups that fit you come first (stable otherwise); the rest wait behind "Show all industries".
  const relevant = relevantIndustries(draft, fromResume);
  const groups = INDUSTRY_GROUPS.map((g) => ({ ...g, hits: g.ids.filter((id) => relevant.has(id)).length }))
    .sort((a, b) => b.hits - a.hits)
    .map((g, i) => ({ ...g, ids: [...g.ids].sort((a, b) => Number(relevant.has(b)) - Number(relevant.has(a))), first: i === 0 }));
  const expanded = showAll || !!query;
  const visible = groups.filter((g) => expanded || g.first || g.hits > 0);
  const hidden = groups.length - visible.length;

  return (
    <div className="space-y-6">
      {fromResume.length > 0 && (
        <div className="rounded-md border border-dashed border-line p-4">
          <p className="mb-2 type-small">
            <span className="font-semibold text-accent-text">{RESUME_LABEL(suggest)}</span>
            <span className="text-muted">: click to add or remove</span>
          </p>
          <ToggleChips
            label="Industries from your resume"
            options={fromResume}
            selected={draft.industries.filter((id) => fromResume.includes(id))}
            onChange={(next) => update({ industries: [...draft.industries.filter((id) => !fromResume.includes(id)), ...next] })}
            format={industryLabel}
          />
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search industries, e.g. forex, neobank, payments…"
          aria-label="Search industries"
          className="h-9 w-full rounded-md border border-line bg-raised pl-9 pr-3 type-small outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      {visible.map((g) => {
        const ids = g.ids.filter(matches);
        if (!ids.length) return null;
        return (
          <Field key={g.label} label={g.label}>
            <ToggleChips
              label={g.label}
              options={ids}
              selected={draft.industries.filter((id) => g.ids.includes(id))}
              // Picked ones stay listed even when the search hides them, so `next` is the whole group's selection.
              onChange={(next) => update({ industries: [...draft.industries.filter((id) => !g.ids.includes(id)), ...next] })}
              format={industryLabel}
            />
          </Field>
        );
      })}
      {hidden > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
          <ChevronDown className="size-4" /> Show all industries
        </Button>
      )}

      <p className="type-small text-muted">
        {draft.industries.length === 0
          ? "None picked. That's OK: your jobs are found by your roles and places."
          : `${draft.industries.length} picked. We'll scan and suggest companies in ${draft.industries.length === 1 ? "this industry" : "these industries"}, and you can narrow your Radar to ${draft.industries.length === 1 ? "it" : "them"}.`}
        {topics.length > 0 && <> Next we'll offer topics like {topics.slice(0, 5).join(", ")}.</>}
      </p>
    </div>
  );
}

// ---------- Topics ----------

/** Weight a topic gets when you add it without choosing one. */
const DEFAULT_WEIGHT = 3;

export function KeywordsStep({ draft, update, suggest, resumeText = "" }: StepProps & { resumeText?: string }) {
  const [cv, setCv] = useState("");
  const entries = Object.entries(draft.keywords).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const fromPaste = useMemo(
    () =>
      cv.trim().length < 40
        ? []
        : Object.entries(CV_DICTIONARY)
            .filter(([k]) => matchesTerm(cv, k))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [cv],
  );
  // With a saved resume, suggestions are ready without pasting anything.
  const found = fromPaste.length ? fromPaste : (suggest?.keywords ?? []);
  const foundWeight = new Map(found);
  const fam = ROLE_FAMILIES.find((f) => f.id === (draft.family ?? inferFamily(draft.include)));
  const setWeight = (k: string, w: number) => {
    const next = { ...draft.keywords };
    if (w <= 0) delete next[k];
    else next[k] = Math.min(5, w);
    update({ keywords: next });
  };
  /** Toggle a group of suggestions on or off, keeping everything outside the group. */
  const toggleGroup = (options: string[], next: string[], weight: (k: string) => number) => {
    const kw = { ...draft.keywords };
    for (const k of options) {
      if (next.includes(k) && !(k in kw)) kw[k] = weight(k);
      if (!next.includes(k) && k in kw) delete kw[k];
    }
    update({ keywords: kw });
  };
  const packActive = (p: (typeof KEYWORD_PACKS)[number]) => Object.keys(p.keywords).every((k) => k in draft.keywords);
  const togglePack = (p: (typeof KEYWORD_PACKS)[number]) => {
    if (!packActive(p)) return update({ keywords: { ...p.keywords, ...draft.keywords } });
    // Keep words that another selected pack also needs (e.g. "payments" is in Fintech and Payments).
    const keep = new Set(KEYWORD_PACKS.filter((o) => o.id !== p.id && packActive(o)).flatMap((o) => Object.keys(o.keywords)));
    const next = { ...draft.keywords };
    for (const k of Object.keys(p.keywords)) if (!keep.has(k)) delete next[k];
    update({ keywords: next });
  };
  const resumeTopics = found.map(([k]) => k).filter((k) => !fam?.topics.includes(k));
  // Everything you picked that isn't offered above, so it can be removed here too.
  const shown = new Set([...(fam?.topics ?? []), ...resumeTopics]);
  const yours = entries.map(([k]) => k).filter((k) => !shown.has(k));

  return (
    <div className="space-y-8">
      {fam && (
        <Field label={`Suggested for ${fam.label}`}>
          <ToggleChips
            label={`Topics for ${fam.label}`}
            options={fam.topics}
            selected={fam.topics.filter((k) => k in draft.keywords)}
            onChange={(next) => toggleGroup(fam.topics, next, () => DEFAULT_WEIGHT)}
          />
        </Field>
      )}

      {resumeTopics.length > 0 && (
        <Field label={fromPaste.length ? "Found in the text you pasted" : RESUME_LABEL(suggest)}>
          <ToggleChips
            label="Suggested topics"
            options={resumeTopics}
            selected={resumeTopics.filter((k) => k in draft.keywords)}
            onChange={(next) => toggleGroup(resumeTopics, next, (k) => foundWeight.get(k) ?? DEFAULT_WEIGHT)}
          />
        </Field>
      )}

      <Field label={fam || resumeTopics.length ? "Add your own" : "Your topics"}>
        <AddKeyword onAdd={(k) => setWeight(k, DEFAULT_WEIGHT)} />
        {yours.length > 0 && (
          <ToggleChips label="Your topics" options={yours} selected={yours} onChange={(next) => toggleGroup(yours, next, () => DEFAULT_WEIGHT)} />
        )}
      </Field>

      <MoreOptions summary={entries.length ? `${entries.length} topics` : undefined}>
        <Field label="Industry topic packs">
          <div className="flex flex-wrap gap-2">
            {KEYWORD_PACKS.map((p) => (
              <PickButton key={p.id} active={packActive(p)} onClick={() => togglePack(p)}>
                {p.label}
              </PickButton>
            ))}
          </div>
        </Field>
        <Field label="Find topics in other text" hint={resumeText ? undefined : "Paste your CV or LinkedIn summary. It stays on this computer."}>
          <textarea
            value={cv}
            onChange={(e) => setCv(e.target.value)}
            rows={3}
            aria-label="Text to find topics in"
            placeholder="Paste text here…"
            className="w-full resize-y rounded-md border border-line bg-raised p-2.5 type-small outline-none placeholder:text-muted focus:border-accent"
          />
        </Field>
        {entries.length > 0 && (
          <Field
            label="Importance"
            hint={
              <>
                <b className="text-ink">5</b> = core, <b className="text-ink">1</b> = nice to have.
              </>
            }
          >
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {entries.map(([k, w]) => (
                <li key={k} className="flex items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate type-small">{k}</span>
                  <WeightControl keyword={k} weight={w} onChange={(n) => setWeight(k, n)} />
                  <button
                    type="button"
                    onClick={() => setWeight(k, 0)}
                    aria-label={`Remove ${k}`}
                    title={`Remove ${k}`}
                    className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-inset hover:text-danger-text"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Field>
        )}
      </MoreOptions>
    </div>
  );
}

/** 1–5 importance as a radio group: arrow keys move, only the checked one is in the tab order. */
function WeightControl({ keyword, weight, onChange }: { keyword: string; weight: number; onChange: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, weight + step));
    onChange(next);
    ref.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next - 1]?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={`Importance of ${keyword}`} onKeyDown={onKey} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={i === weight}
          aria-label={String(i)}
          tabIndex={i === weight ? 0 : -1}
          onClick={() => onChange(i)}
          className={cx(
            "flex size-6 items-center justify-center rounded-md type-meta font-medium tabular transition-colors",
            i === weight ? "bg-accent text-on-accent" : i < weight ? "bg-accent-subtle text-accent-text" : "bg-inset text-muted hover:bg-line",
          )}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function AddKeyword({ onAdd }: { onAdd: (k: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    const k = text.trim().toLowerCase();
    if (k) onAdd(k);
    setText("");
  };
  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
        placeholder="Add a keyword, e.g. tokenization"
        aria-label="Add a keyword"
        className="h-9 min-w-0 flex-1 rounded-md border border-line bg-raised px-3 type-small outline-none placeholder:text-muted focus:border-accent"
      />
      <Button onClick={submit} disabled={!text.trim()}>
        <Plus className="size-4" /> Add
      </Button>
    </div>
  );
}

// ---------- threshold (Review and Settings) ----------

export const THRESHOLDS = [
  { value: 70, label: "Strong matches only", hint: "Title, place and several of your topics line up" },
  { value: 55, label: "Good and strong", hint: "Right role and place, some topic overlap" },
  { value: 40, label: "Everything that fits", hint: "Right role and place, topics optional" },
];

export function ThresholdPicker({ draft, update }: StepProps) {
  const custom = !THRESHOLDS.some((t) => t.value === draft.minScore);
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {THRESHOLDS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => update({ minScore: t.value })}
          aria-pressed={draft.minScore === t.value}
          className={cx(
            "rounded-md border p-3 text-left transition-colors",
            draft.minScore === t.value ? "border-accent bg-accent-subtle/50" : "border-line hover:bg-inset",
          )}
        >
          <span className="block type-small font-semibold">
            {t.label} <span className="tabular font-normal text-muted">({t.value}+)</span>
          </span>
          <span className="mt-0.5 block type-meta text-muted">{t.hint}</span>
        </button>
      ))}
      {custom && <p className="type-meta text-muted sm:col-span-3">Custom threshold from your config: {draft.minScore}+</p>}
    </div>
  );
}
