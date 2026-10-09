# Job Hunter company directory

A shared, weekly-rebuilt list of companies and their public job boards (Greenhouse, Lever, Ashby,
SmartRecruiters, Workday), used by [Job Hunter](https://github.com/Tanmay-Mhatre/job-hunter) installs
for company suggestions and browsing.

## Files

- **Releases → latest**: `manifest.json` (version, counts, SHA-256 of each file), `directory.json.gz`
  (every live or dormant company), `index.json.gz` (open job titles and locations per company).
- `contributions.json`: companies users added by link, each live-checked before it was accepted.
- `coverage.md`: how many must-have companies per industry can be tracked, and which hiring systems to support next.
- `denylist.json`: companies removed on request. They are left out of every release.
- `LICENSE-DATA`: the data is CC BY 4.0. `NOTICE.md`: sources, credits and how to ask for a takedown.

## How it's built

Every Monday: public company-board lists (see NOTICE.md), the project's industry seed list and the
contributions are merged, every board is live-checked with the cheapest call its hiring system
offers, open roles are indexed, industries are tagged, and a new release is published. Contributions
arrive between rebuilds every 3 hours.

No personal data is stored here: a contribution is a hiring system, a board name and a company name.

## Licence and takedowns

The data is licensed under [CC BY 4.0](LICENSE-DATA). Data from third-party job APIs (Remotive,
The Muse, Jobicy, RemoteOK, Hacker News) is never included. To have a company removed, see
[Takedown and opt-out](NOTICE.md#takedown-and-opt-out); we reply within 7 days.
