# Matching eval set

A fixed, labelled set for measuring how well `scoreJob` ranks jobs for a person. Tests elsewhere check
hand-picked numbers; this checks the order a person would want. Run it before and after every scoring change.

Everything here is invented: the candidates, the companies and the postings. No real people, no copied postings.

## What's in it

| Path | What |
|---|---|
| `profiles/*.yaml` | Six candidates across role families. Each has a real RawJobs `profile` (what the scorer sees) and an `about` block: a short resume summary with level, work authorisation, salary floor and dealbreakers (what a labeller reads; the scorer can't see it yet). |
| `jobs/*.json` | 49 postings, grouped by family. Realistic noise on purpose: company boilerplate, requirements vs nice-to-haves, sponsorship lines, EEO footers. Includes hard cases: the same role at several levels, synonyms (k8s, Golang, ML, payment), keyword-stuffed wrong roles, right roles with a dealbreaker, title-only postings, and adjacent titles that fit. |
| `labels.yaml` | A 0..4 label, a one-line `why`, and `by` for every profile x posting pair (294). |
| `lib.ts` | Loads and checks the set, scores every pair, computes the metrics. |
| `run.ts` | The report (`pnpm eval:match`). |
| `baseline.json` | The last accepted report, with every pair's score. `test/eval.test.ts` fails if NDCG@10 drops more than 0.02 below it. |
| `REVIEW.md` | 50 draft labels for a person to confirm or correct. |

## Rubric

| Label | Meaning |
|---|---|
| 4 Strong | Would apply today: meets the must-haves, right level, no dealbreaker. |
| 3 Good | Worth applying: minor gaps (a nice-to-have, one level off, adjacent domain). |
| 2 Stretch | Plausible but real gaps (missing a must-have, two levels off, new domain). |
| 1 Poor | Same field but clearly wrong (wrong specialisation, far level, keyword match only). |
| 0 No | Not relevant, or a dealbreaker (different job, visa / location / salary blocker). |

Label by reading the profile's `about` and the posting, never by looking at the score. The set exists to catch
where the scorer is wrong, so a label tuned to the scorer is worthless. Unknowns (no description, no salary) are
judged on what is known: a title-only posting that fits on everything we can see is a 3, not a failure.

## Running it

```
pnpm eval:match              # the report
pnpm eval:match --compare    # the same, with changes against baseline.json and the pairs whose score moved
pnpm eval:match --pairs      # also each profile's postings by score, next to their labels
pnpm eval:match --json       # write baseline.json (when a change is accepted)
```

The report shows, per profile and as a mean:

- **NDCG@5 / NDCG@10** of the score order, gain 2^label - 1. Equal scores are averaged, so ties never help or hurt.
- **P@5**: share of the top five labelled 3 or 4. Some profiles have fewer than five such postings, so 1.0 isn't always reachable; compare against the baseline, not against 1.
- **Spearman** correlation of score and label over all postings.
- **Band agreement**: the score's band from `min_score` (strong at min_score, good within 20 below, else weak) against the label's band (4-3 strong, 2 good, 1-0 weak), as a 3 x 3 table.
- The **10 worst disagreements**: score / 25 furthest from the label, with the label's `why`.

When a scoring change makes the order better, run `--json` and commit the new `baseline.json` with it.

## Adding pairs

- A **posting**: add it to a `jobs/*.json` file with a new id (`title`, `company`, `industries` if known,
  `location`, `workplace`, optional `salary`, `postedAt`, `description`). Then label it for **every** profile in
  `labels.yaml`: the test fails on any unlabelled pair.
- A **profile**: add `profiles/<id>.yaml` with `id`, `summary`, `about` and `profile`, and a block for it in
  `labels.yaml` with a label for every posting.
- Write labels before running the scorer on the new pairs, then rerun `--json` to refresh the baseline.

## Who labelled what

`by: draft` labels were written by Claude from the rubric, before the scorer was run. When a person confirms or
corrects one (see `REVIEW.md`), set its `by: user` and change the label if needed. The report counts how many
pairs have been reviewed.
