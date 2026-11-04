# Election Desk 2026

Website: https://ajf-2026-election-results.axdfhfhsbfb.chatgpt.site

A public results-only dashboard for the 2026 U.S. Senate, House and Governor elections. It includes national, state, congressional-district and county views, with geographic maps and county tiles.

Reported counts and race calls are attributed to CNN. Map colors indicate the reported leader; they are not race calls. Unassigned source votes remain unassigned. The site does not publish a prediction model, methodology, win odds or its own race calls.

The Worker refreshes bounded public source data when visitors request it, caches the last verified snapshot and retains that snapshot if the source is unavailable. The dashboard displays retrieval/source timestamps and errors; no AP credentials are required.

## Development

Node.js 22 or newer is required. There are no runtime package dependencies.

```sh
npm test
npm run build
```

`site/` contains the frontend and licensed map assets. `site-worker/` contains the read-only results API. The build produces a self-contained Worker in `dist/server/index.js`, embedding the frontend assets. Hosting identity is in `.openai/hosting.json`.

Research files already in this repository are retained as source materials; they are not served by the public dashboard.
