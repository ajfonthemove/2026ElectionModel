# Election Desk 2026

https://ajfonthemove.github.io/2026ElectionModel/

Live CNN results for Senate, House and Governor elections. National seat totals combine seats not up this year with CNN-called winners: 100 Senate seats, 435 House seats and 50 governorships. Each party total shows its held and won components.

**Votes vs President** compares current party counts with Harris/Trump 2024 or Biden/Trump 2020, alongside state registration counts and count differences. State and county maps coordinate with searchable comparison tables. Missing values are omitted. Dates, definitions and sources remain accessible through Source details and the attribution pages.

## Development

Node.js 22 or newer. No runtime package dependencies.

```sh
npm test
npm run preview
```

Preview: http://127.0.0.1:8769/2026ElectionModel/.

`site/` contains the frontend and map assets; `site-worker/` contains the shared CNN results normalizer. The static build in `dist/` is published to GitHub Pages by the workflow on `main`. CNN feeds run directly in the browser. Seat inventories and registration snapshots are source-backed static artifacts.

Research materials remain in the repository and are excluded from the published dashboard.
