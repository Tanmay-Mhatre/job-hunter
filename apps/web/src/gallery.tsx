import { Bookmark, Check, Copy, Ellipsis, ExternalLink, RefreshCw, X } from "lucide-react";
import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Button, Chip, ChipGroup, Field, IconButton, Kbd, Menu, ScoreBadge, ScoreBreakdown, scoreParts, SearchField, SourceTag, Status, Tabs } from "./components/primitives";
import { toast, Toaster } from "./components/Toast";
import { applyTheme, useTheme, type ThemeChoice } from "./lib/theme";
import "./index.css";

/**
 * The component gallery (design.html, dev only): every Phase 2 primitive with the content of its
 * design/components/<Name>/preview.html, to check against design/screenshots in all four themes.
 */
applyTheme();

function Card({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`c-${name}`} className="space-y-4 rounded-md border border-line bg-raised p-4 shadow-l1">
      <header>
        <h2 id={`c-${name}`} className="type-subheading">
          {name}
        </h2>
        <p className="type-meta text-muted">{note}</p>
      </header>
      {children}
    </section>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-3">{children}</div>;
const Cap = ({ children }: { children: ReactNode }) => <span className="type-meta text-muted">{children}</span>;

function Gallery() {
  const { theme, contrast, setTheme, setContrast, active } = useTheme();
  const [tab, setTab] = useState<"all" | "mine" | "new" | "strong" | "saved" | "applied">("all");
  const [chips, setChips] = useState({ strong: true, new: false, remote: false, week: false });
  const flip = (k: keyof typeof chips) => setChips((c) => ({ ...c, [k]: !c[k] }));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-title">Components</h1>
          <p className="type-small text-muted">Phase 2 primitives, as in design/components. Theme: {active}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["system", "light", "dark"] as ThemeChoice[]).map((t) => (
            <Chip key={t} pressed={theme === t} onClick={() => setTheme(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </Chip>
          ))}
          <Chip pressed={contrast === "more"} onClick={() => setContrast(contrast === "more" ? "system" : "more")}>
            Increase contrast
          </Chip>
        </div>
      </header>

      <Card name="Button" note="Primary, secondary, quiet, danger, icon">
        <Row>
          <Button variant="primary" icon={<RefreshCw className="rj-icon" aria-hidden />} shortcut="R">
            Scan now
          </Button>
          <Button>Check this company</Button>
          <Button variant="quiet">Not interested</Button>
          <Button variant="danger">Remove company</Button>
        </Row>
        <Row>
          <Button size="sm" icon={<ExternalLink className="rj-icon" aria-hidden />}>
            Open posting
          </Button>
          <IconButton label="Copy job description" shortcut="C">
            <Copy className="rj-icon" aria-hidden />
          </IconButton>
          <IconButton label="More actions">
            <Ellipsis className="rj-icon" aria-hidden />
          </IconButton>
          <Button disabled>Scanning…</Button>
        </Row>
      </Card>

      <Card name="Kbd" note="Keyboard keys">
        <Row>
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <Cap>move</Cap>
          <Kbd>↵</Kbd>
          <Cap>open</Cap>
          <Kbd>S</Kbd>
          <Cap>save</Cap>
          <Kbd>A</Kbd>
          <Cap>applied</Cap>
          <Kbd>X</Kbd>
          <Cap>not interested</Cap>
          <Kbd>R</Kbd>
          <Cap>scan now</Cap>
          <Kbd>/</Kbd>
          <Cap>search</Cap>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <Cap>commands</Cap>
        </Row>
      </Card>

      <Card name="Status" note="Shape + color + label">
        <Row>
          <Status state="healthy" />
          <Status state="dormant" />
          <Status state="broken" />
        </Row>
        <Cap>Filled square: healthy or strong. Half: dormant or fair. Empty: weak. Slashed: broken.</Cap>
      </Card>

      <Card name="Score badge" note="Fetched (solid) and estimated (dashed)">
        <Row>
          <ScoreBadge score={74} />
          <ScoreBadge score={58} />
          <ScoreBadge score={23} />
          <Cap>fetched: full description scored</Cap>
        </Row>
        <Row>
          <ScoreBadge score={68} estimated />
          <ScoreBadge score={56} estimated />
          <ScoreBadge score={21} estimated />
          <Cap>estimated: title, place and industry only</Cap>
        </Row>
        <Row>
          <ScoreBadge score={74} size="lg" />
          <Cap>drawer size</Cap>
        </Row>
      </Card>

      <Card name="Score breakdown" note="title 30 · place 20 · keywords 40 · fresh 10">
        <div className="flex flex-wrap items-center gap-4">
          <ScoreBadge score={74} size="lg" />
          <div>
            <h3 className="rj-h">Why it matched</h3>
            <Cap>Strong match. Threshold 65.</Cap>
          </div>
        </div>
        <ScoreBreakdown
          className="max-w-[560px]"
          score={74}
          parts={scoreParts({ title: 30, location: 20, keywordPoints: 14, freshness: 10 })}
          found={["crypto", "tokenization", "exchange"]}
          missing={["payments", "custody"]}
        />
      </Card>

      <Card name="Source tag" note="Hiring system, age, live dot">
        <div className="flex flex-wrap items-center gap-6">
          <SourceTag source="Greenhouse" age="2d" isNew />
          <SourceTag source="Lever" age="6d" />
          <SourceTag source="Ashby" age="14d" />
          <SourceTag source="Workday" age="31d" />
          <SourceTag source="SmartRecruiters" age="3d" />
        </div>
      </Card>

      <Card name="Chip" note="Filters you turn on and off">
        <ChipGroup label="Filters">
          <Chip pressed={chips.strong} count={12} onClick={() => flip("strong")}>
            Strong matches
          </Chip>
          <Chip pressed={chips.new} count={9} onClick={() => flip("new")}>
            New
          </Chip>
          <Chip pressed={chips.remote} onClick={() => flip("remote")}>
            Remote
          </Chip>
          <Chip pressed={chips.week} onClick={() => flip("week")}>
            Posted this week
          </Chip>
        </ChipGroup>
      </Card>

      <Card name="Tabs" note="Views of one list">
        <Tabs
          label="Radar views"
          value={tab}
          onChange={setTab}
          items={[
            { id: "all", label: "All", count: 214 },
            { id: "mine", label: "My companies", count: 18 },
            { id: "new", label: "New", count: 9 },
            { id: "strong", label: "Strong", count: 12 },
            { id: "saved", label: "Saved", count: 5 },
            { id: "applied", label: "Applied", count: 3 },
          ]}
        />
      </Card>

      <Card name="Field" note="Label, input, help or error">
        <div className="grid max-w-[420px] gap-4">
          <SearchField label="Search jobs" placeholder="Search titles, companies, places" />
          <Field label="Strong match threshold" inputMode="numeric" defaultValue="65" help="Jobs scoring this or higher are marked strong and alert you first." />
          <Field label="Careers page link" defaultValue="jobs.lever.co/acme-exchange/" error="This board returned no jobs. Check the link or try the company's main careers page." />
        </div>
      </Card>

      <Card name="Toast" note="Confirms what just happened, with Undo">
        <Row>
          <Button onClick={() => toast({ message: "Saved Head of Product, Exchange", actionLabel: "Undo", onAction: () => {} })}>Show a toast</Button>
        </Row>
      </Card>

      <Card name="Menu" note="Actions for one thing, with shortcuts">
        <div className="min-h-64">
          <Menu
            label="Job actions"
            align="start"
            trigger={(p) => (
              <button type="button" className="rj-btn" {...p}>
                <Ellipsis className="rj-icon" aria-hidden />
                Job actions
              </button>
            )}
            items={[
              { id: "save", label: "Save", icon: <Bookmark className="rj-icon" aria-hidden />, shortcut: "S", onSelect: () => {} },
              { id: "applied", label: "Mark as applied", icon: <Check className="rj-icon" aria-hidden />, shortcut: "A", onSelect: () => {} },
              { id: "copy", label: "Copy description", icon: <Copy className="rj-icon" aria-hidden />, shortcut: "C", onSelect: () => {} },
              { id: "open", label: "Open posting", icon: <ExternalLink className="rj-icon" aria-hidden />, onSelect: () => {} },
              { separator: true, id: "sep" },
              { id: "hide", label: "Hide this company", icon: <X className="rj-icon" aria-hidden />, danger: true, onSelect: () => {} },
            ]}
          />
        </div>
      </Card>
      <Toaster />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
