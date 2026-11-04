# Election Desk 2026

Website: https://ajfonthemove.github.io/2026ElectionModel/

A public results-only dashboard for the 2026 U.S. Senate, House and Governor elections. It includes national, state, congressional-district and county views, with geographic maps and county tiles.

Reported counts and race calls are attributed to CNN. Map colors indicate the reported leader; they are not race calls. Unassigned source votes remain unassigned. The site does not publish a prediction model, methodology, win odds or its own race calls.

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
