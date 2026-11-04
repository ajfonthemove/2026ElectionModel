# Election Desk 2026

Website: https://ajfonthemove.github.io/2026ElectionModel/

A public results-only dashboard for the 2026 U.S. Senate, House and Governor elections. It includes national, state, congressional-district and county views, with geographic maps and county tiles.

Reported counts and race calls are attributed to CNN. Results colors indicate the reported leader; they are not race calls. Unassigned source votes remain unassigned. CNN's estimated votes-in percentage and its remaining percentage are displayed separately from vote totals; the feed does not supply an absolute remaining-vote count.

Select **Votes vs President**, then **2024** or **2020**, to see current Democratic votes as a percentage of Harris's or Biden's votes and current Republican votes as a percentage of Trump's votes. Each party has its own current count and historical denominator. These ratios can exceed 100%; they do not estimate completion, remaining votes or individual voter retention. Choose either party's ratio for the map colors, or the secondary change in reported D-minus-R margin. House district comparisons require a verified historical boundary match and remain unavailable. Historical data attribution and geographic exclusions are documented in `site/data/presidential-history-sources.html`.

County controls open geographic outlines by default. The searchable county table shows current party counts, presidential count ratios and CNN's estimated share remaining. County selection, filters and sorting persist through refreshes. Overlapping Michigan town detail stays separate from county totals; town-only and Alaska election-district feeds remain usable as labeled tiles without invented county matches. The site does not publish a prediction model, win odds or its own race calls.

The same presidential view shows state registration counts beside the current party vote and presidential benchmark, plus a searchable all-state table. Each snapshot retains its date, population definition and source; older or undated secondary references are labeled. Twelve states use an explicitly historical 2024 total while a newer total remains unverified. Missing party counts remain unavailable. County and House views show statewide context without applying a statewide denominator to their results; office-eligibility or accounting conflicts also suppress derived comparisons. Registration does not identify how registered voters voted.

The browser reads CNN’s public CORS-enabled feeds directly, caches verified snapshots and retains them if the source is unavailable. The dashboard displays retrieval/source timestamps and errors; no AP credentials are required.

## Development

Node.js 22 or newer is required. There are no runtime package dependencies.

```sh
npm test
npm run preview
```

`npm test` builds and checks the site. The preview serves http://127.0.0.1:8769/2026ElectionModel/.

`site/` contains the frontend and licensed map assets. `site-worker/` contains the shared results normalizer. The build produces the static GitHub Pages site in `dist/`. The Pages workflow publishes changes to `main` automatically after Pages is enabled with **Settings → Pages → Source: GitHub Actions**. The validated source normalizer runs in the browser; no server backend is required.

Research files already in this repository are retained as source materials; they are not served by the public dashboard.
