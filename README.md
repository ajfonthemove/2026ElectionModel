# Election Desk 2026

Website: https://ajfonthemove.github.io/2026ElectionModel/

A public results-only dashboard for the 2026 U.S. Senate, House and Governor elections. It includes national, state, congressional-district and county views, with geographic maps and county tiles.

Reported counts and race calls are attributed to CNN. Results colors indicate the reported leader; they are not race calls. Unassigned source votes remain unassigned. CNN's estimated votes-in percentage and its remaining percentage are displayed separately from vote totals; the feed does not supply an absolute remaining-vote count.

Select **vs President**, then **2024** or **2020**, to compare the current D-minus-R reported margin with historical presidential results. State and exact county views show descriptive shifts; they are partial current returns against historical reported results, not a forecast. House district comparisons require a verified historical boundary match and remain unavailable. Historical data attribution and geographic exclusions are documented in `site/data/presidential-history-sources.html`.

County controls load the selected race directly. Overlapping Michigan town detail stays separate from county totals; town-only and Alaska election-district feeds remain usable as labeled tiles without invented county matches. The site does not publish a prediction model, win odds or its own race calls.

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
