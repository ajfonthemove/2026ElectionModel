/** Browser-only public CNN results adapter; no server or third-party proxy. */
import { createResultsWorker } from './cnn-results.js';

const CACHE_NAME = 'election-desk-2026-results-v1';
const CACHE_ITEMS = 65;
const CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ALLOWED_ROUTES = new Set(['/api/results-map', '/api/results-map/refresh']);

/** The same validated last-good records may survive a page reload. */
export function browserSnapshotCache(cacheStorage, now = () => Date.now()) {
  if (!cacheStorage?.open) return undefined;
  let opened;
  const cache = () => (opened ||= Promise.resolve().then(() => cacheStorage.open(CACHE_NAME)));
  return {
    async match(request) {
      const store = await cache();
      const response = await store.match(request);
      if (!response) return undefined;
      const stamp = response.headers.get('X-Election-Cached-At');
      const written = stamp === null ? NaN : Number(stamp);
      if (!Number.isFinite(written) || now() - written > CACHE_AGE_MS || written > now() + 60_000) {
        await store.delete(request);return undefined;
      }
      return response;
    },
    async put(request, response) {
      const store = await cache();
      const headers = new Headers(response.headers);headers.set('X-Election-Cached-At', String(now()));
      await store.put(request, new Response(response.body, { status: response.status, headers }));
      const keys = await store.keys();
      for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_ITEMS))) await store.delete(key);
    },
  };
}

/** Use normal browser CORS and its genuine origin/user-agent headers. */
export function browserSourceFetcher(fetcher = globalThis.fetch.bind(globalThis)) {
  return (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.origin !== 'https://politics.api.cnn.io' || !/^\/results\/(?:national-races|county-races)\/2026-[A-Z]{2}-?[A-Z0-9-]*\.json$/.test(url.pathname) || url.search || url.hash) {
      throw new TypeError('Only the public CNN election-results feed is supported.');
    }
    const headers = new Headers(init.headers);
    for (const name of ['User-Agent', 'Origin', 'Referer']) headers.delete(name);
    return fetcher(input, { ...init, headers, mode: 'cors', credentials: 'omit' });
  };
}

export function createResultsClient({ fetcher = globalThis.fetch.bind(globalThis), cacheStorage = globalThis.caches,
  now = () => Date.now(), origin = globalThis.location?.origin || 'https://election-results.invalid' } = {}) {
  const worker = createResultsWorker({ fetcher: browserSourceFetcher(fetcher), cache: browserSnapshotCache(cacheStorage, now), now });
  return async (input, init = {}) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(new URL(input, `${origin}/`), init);
    const url = new URL(request.url);
    if (url.origin !== origin || !ALLOWED_ROUTES.has(url.pathname)) {
      return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return worker.fetch(request);
  };
}

export const resultsFetch = createResultsClient();
