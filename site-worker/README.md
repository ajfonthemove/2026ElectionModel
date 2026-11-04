# Public results Worker

`index.js` is a dependency-free Cloudflare Worker ESM entrypoint. Bind `ASSETS`
to the public `site/` frontend, or supply an equivalent `ASSETS.fetch(request)`
shim when packaging embedded static assets. The Worker never reads the model,
research, registration, polling or local `var/` directories.

Public API:

- `GET /api/results-map`, with optional single `office`, `state`, `race_id`, and
  `detail=county` query fields.
- `POST /api/results-map/refresh`, JSON `{}` or `{"county_race_id":"2026-SG-NC"}`.
- Other `/api/` routes return 404, including every model and research endpoint.
- Other GET/HEAD requests go to `ASSETS`; other methods return 405.

The response follows `results_map_v1`. CNN is the attributed results provider.
Only explicitly released source calls are shown; own calls and win odds stay
null. All published candidate counts are retained. A positive difference
between the source total and listed candidates remains unattributed. Invalid
negative/fractional/overattributed counts or identity mismatches are rejected.
Unreleased votes remain null. A source reporting percentage is never presented
as the fraction of votes counted.

The three fixed public national feeds refresh at most once per 30 seconds.
A selected county feed requires a verified national parent race. Every fetch
has a 10-second timeout and 8 MiB bound. Cloudflare Cache API snapshots retain
last verified results for seven days; a bounded 65-item isolate cache is a local
fallback. Upstream failure retains the last successful snapshot and its original
`checked_at`; refresh attempts are separately timestamped. Healthy offices may
advance while another office is stale. County totals are never added to state
results. These are rolling display caches, not historical research archives.

Run fixtures with:

```sh
cd site-worker
npm test
```

The direct Node command runs 14 assertions. This managed sandbox's `node --test`
wrapper sometimes reports only the file-level test, so the package uses direct
`node test/worker.test.js`. For local live Node fetches, preserve the session
proxy and CA trust; Node 24 supports `NODE_USE_ENV_PROXY=1`. Cloudflare production
fetch uses the platform's normal outbound network.

`verification.json` records a live check of the exact packaged Worker and public
frontend, including 506 national races, House filtering, county detail, and 404
responses from private research endpoints. The Worker requires no credentials.
Publishing and Git operations are handled by the root deployment task.
