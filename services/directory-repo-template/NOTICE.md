# Sources, licences and takedowns

The directory and job index are licensed under CC BY 4.0 (see `LICENSE-DATA`). They are built
from the sources below. Only sources whose licence allows it may add a company; the others are
used only to confirm boards that are already listed, and are never published.

## Sources

| Source | Licence | Use |
|---|---|---|
| Companies' own public job boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workday) | facts published by each company | live checks; job titles, locations and dates in the index |
| [latmay/ats-career-page-urls](https://huggingface.co/datasets/latmay/ats-career-page-urls) | CC BY 4.0 | adds companies |
| [kalil0321/ats-scrapers](https://github.com/kalil0321/ats-scrapers) | MIT | adds companies |
| [ConorsCode/open-jobs-data](https://github.com/ConorsCode/open-jobs-data) | MIT | adds companies |
| [crypto-jobs-fyi/crawler](https://github.com/crypto-jobs-fyi/crawler) | Apache-2.0 | adds companies, industry labels |
| [Common Crawl](https://commoncrawl.org) URL index (our own query) | [Common Crawl terms of use](https://commoncrawl.org/terms-of-use) | adds companies (board URLs only) |
| [Wayback Machine](https://web.archive.org) CDX index (our own query) | [Internet Archive terms of use](https://archive.org/about/terms.php) | adds companies (board URLs only) |
| [Wikidata](https://www.wikidata.org) companies | CC0 | company names and websites, to find their boards |
| Job Hunter industry seed list | MIT (Job Hunter) | adds companies, industry labels |
| Boards shared by Job Hunter users ("Add by link") | CC BY 4.0 (this directory) | adds companies, after a live check |
| LastRound ATS directory (planned, not used yet) | CC BY 4.0 | will add companies, each verified live |
| [Feashliaa/job-board-aggregator](https://github.com/Feashliaa/job-board-aggregator) | CC BY-NC | confirmation only, never published |
| [ElliotGbaum/upstreamit](https://github.com/ElliotGbaum/upstreamit) | CC BY-SA | confirmation only, never published |

Contains information from latmay/ats-career-page-urls, made available under the Creative Commons
Attribution 4.0 International licence.

Contains data from Wikidata, made available under CC0.

## Never redistributed

Job Hunter may also read third-party job APIs (planned): Remotive, The Muse, Jobicy, RemoteOK and
Hacker News "Who is hiring". Their data is fetched on each user's own computer, shown with credit
to the source, and **never** included in this directory, the index or any release.

## Takedown and opt-out

If you run a company and don't want it listed, or you see something here that shouldn't be:

1. Open a [takedown request](https://github.com/Tanmay-Mhatre/job-hunter/issues/new?template=takedown.yml)
   (or an issue in this repo). Give the company name and its careers page or domain. Don't include
   personal data.
2. We reply within **7 days**. Once confirmed, the company goes into `denylist.json`.
3. The next release (contributions run every 3 hours, full rebuild every Monday) leaves it out of
   the directory and the index, and user contributions can't add it back.

Older releases stay downloadable on GitHub; we don't rewrite history. If something in an older
release is a legal problem, say so in the request and we will remove that release.

The listing only says that a company has a public job board, and what is posted there. Jobs keep
linking to the company's own careers page.
