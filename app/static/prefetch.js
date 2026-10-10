/*!
 * cdnV2 link prefetcher.
 *
 * Once a page has settled, quietly fetches the pages it links to (folders, file pages, the navbar
 * destinations) so the server's listing cache is already warm when you click. The expensive part of a
 * click is the cold Hugging Face lookup behind a folder, and that cache only lives for 60 seconds, so
 * this re-warms it just ahead of use.
 *
 * Deliberately conservative:
 *   - same-origin links only; never /api/*, /admin, /mask/*, /pack/*, /static/*, /raw/*, downloads,
 *     links with target/download, or anything inside data-turbo="false" / data-no-prefetch
 *   - at most 16 pages per page view, 2 at a time, page content before navbar links, visible links
 *     first, and only while the tab is visible
 *   - idle time only; cancelled the moment you navigate so it never competes with a real click
 *   - skipped entirely on Save-Data, 2g connections and prefers-reduced-data
 *
 * Opt out: <meta name="cdn-prefetch" content="off"> on a page, or data-no-prefetch on a link/container.
 * Works with Turbo (re-runs on turbo:load) and without it. Loaded once from <head>; safe to include twice.
 */
(function (global) {
  'use strict';

  const DEFAULTS = { maxLinks: 16, concurrency: 2, ttlMs: 50000 };

  // First path segments that belong to the app itself, not to the CDN's content. Anything under them is
  // an API, a redirect, an admin page or a download, so it must never be fetched speculatively.
  const RESERVED_SEGMENTS = new Set(['api', 'admin', 'mask', 'pack', 'static', 'raw']);

  function pathAllowed(pathname) {
    if (pathname === '/favicon.ico') return false;
    const first = pathname.split('/')[1] || '';
    return !RESERVED_SEGMENTS.has(first);
  }

  // Returns the normalised URL to prefetch for a link, or null if it should be left alone.
  // `link` is plain data ({href, target, download, noPrefetch, turboOff}) and `base` a URL for the
  // current page, so this stays testable without a DOM.
  function candidateUrl(link, base) {
    if (link.download || link.noPrefetch || link.turboOff) return null;
    if (link.target && link.target !== '_self') return null;
    let url;
    try {
      url = new URL(link.href, base);
    } catch (e) {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.origin !== base.origin) return null;
    if (!pathAllowed(url.pathname)) return null;
    if (url.pathname === base.pathname && url.search === base.search) return null; // this page
    url.hash = '';
    return url.href;
  }

  // A small bounded work queue. `fetchFn(url, signal)` must return a promise that settles when the
  // response has been fully read (the server only finishes warming its cache once it has answered).
  function createPrefetcher(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts.config);
    const now = opts.now || Date.now;
    const seen = new Map(); // url -> when it last finished; stops repeat fetches inside the cache TTL
    const inflight = new Set();
    let queue = [];
    let queued = new Set();
    let active = 0;
    let used = 0; // pages accepted for the current page view (the budget)
    let paused = false;
    let controller = new AbortController();

    function fresh(url) {
      const t = seen.get(url);
      return t !== undefined && now() - t < cfg.ttlMs;
    }

    function run(url) {
      active++;
      inflight.add(url);
      const signal = controller.signal;
      Promise.resolve()
        .then(() => opts.fetchFn(url, signal))
        .then(
          () => seen.set(url, now()),
          // A failed fetch is remembered too, so a flaky or 404 link is not retried in a loop.
          () => { if (!signal.aborted) seen.set(url, now()); }
        )
        .then(() => {
          active--;
          inflight.delete(url);
          pump();
        });
    }

    function pump() {
      while (!paused && active < cfg.concurrency && queue.length) run(queue.shift());
    }

    return {
      // Start a new page view: fresh budget, drop anything still waiting. Finished work is remembered.
      newPage() {
        queue = [];
        queued = new Set();
        used = 0;
      },
      remaining() {
        return cfg.maxLinks - used;
      },
      enqueue(urls) {
        let added = 0;
        for (const url of urls) {
          if (used >= cfg.maxLinks) break;
          if (queued.has(url) || inflight.has(url) || fresh(url)) continue;
          queue.push(url);
          queued.add(url);
          used++;
          added++;
        }
        pump();
        return added;
      },
      // Cancel in-flight requests and forget the queue (called when navigating away).
      abort() {
        controller.abort();
        controller = new AbortController();
        queue = [];
        queued = new Set();
      },
      setPaused(value) {
        paused = !!value;
        if (!paused) pump();
      },
      stats() {
        return { queued: queue.length, active, remembered: seen.size, used };
      },
    };
  }

  function shouldSkipDevice(win) {
    const conn = win.navigator && (win.navigator.connection || win.navigator.mozConnection);
    if (conn && (conn.saveData || /2g$/.test(conn.effectiveType || ''))) return true;
    if (win.matchMedia && win.matchMedia('(prefers-reduced-data: reduce)').matches) return true;
    return false;
  }

  function boot(win) {
    const doc = win.document;
    if (!doc || win.__cdnPrefetch || typeof win.fetch !== 'function') return;
    if (shouldSkipDevice(win)) return;

    const conn = win.navigator && win.navigator.connection;
    const config = conn && conn.effectiveType === '3g' ? { maxLinks: 6, concurrency: 1 } : {};

    const pf = createPrefetcher({
      config,
      fetchFn: (url, signal) =>
        win
          .fetch(url, {
            credentials: 'same-origin',
            signal,
            priority: 'low', // ignored by browsers that don't support it
            headers: { Accept: 'text/html', 'X-Purpose': 'prefetch' },
          })
          .then((res) => res.arrayBuffer()),
    });
    win.__cdnPrefetch = pf; // handy for debugging: __cdnPrefetch.stats()

    function scan(freshPage) {
      if (doc.querySelector('meta[name="cdn-prefetch"][content="off"]')) return;
      if (freshPage) pf.newPage();
      if (pf.remaining() <= 0) return;

      const base = new URL(win.location.href);
      const viewport = win.innerHeight || 800;
      const found = [];
      const dedupe = new Set();

      doc.querySelectorAll('a[href]').forEach((a) => {
        if (a.getClientRects().length === 0) return; // hidden: filtered-out rows, collapsed menus
        const url = candidateUrl(
          {
            href: a.href,
            target: a.getAttribute('target'),
            download: a.hasAttribute('download'),
            noPrefetch: !!a.closest('[data-no-prefetch]'),
            turboOff: !!a.closest('[data-turbo="false"]'),
          },
          base
        );
        if (!url || dedupe.has(url)) return;
        dedupe.add(url);
        const r = a.getBoundingClientRect();
        // Page content first (on-screen links, plus a screenful below, ahead of the rest), then site
        // chrome (navbar, footer). Those pages are cheap for the server, so they only get what's left.
        const chrome = !!a.closest('header, nav, footer');
        found.push({ url, rank: chrome ? 2 : r.bottom > 0 && r.top < viewport * 1.5 ? 0 : 1 });
      });

      found.sort((x, y) => x.rank - y.rank);
      pf.enqueue(found.map((f) => f.url));
    }

    // Wait for the page to finish loading and the browser to go idle before touching the network.
    let pending = false;
    let pendingFresh = false;
    function request(freshPage) {
      pendingFresh = pendingFresh || freshPage;
      if (pending) return;
      pending = true;
      const go = () => {
        const run = () => {
          pending = false;
          const f = pendingFresh;
          pendingFresh = false;
          scan(f);
        };
        if (win.requestIdleCallback) win.requestIdleCallback(run, { timeout: 2000 });
        else win.setTimeout(run, 300);
      };
      if (doc.readyState === 'complete') go();
      else win.addEventListener('load', go, { once: true });
    }

    request(true);
    doc.addEventListener('turbo:load', () => request(true));

    // Pages that build their list with JS (search results, history) add links after load.
    let timer = 0;
    new win.MutationObserver(() => {
      win.clearTimeout(timer);
      timer = win.setTimeout(() => request(false), 800);
    }).observe(doc.documentElement, { childList: true, subtree: true });

    pf.setPaused(doc.hidden);
    doc.addEventListener('visibilitychange', () => pf.setPaused(doc.hidden));

    // Navigating: stop prefetching so the real request gets the connection to itself.
    doc.addEventListener('turbo:before-visit', () => pf.abort());
    win.addEventListener('pagehide', () => pf.abort());
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { DEFAULTS, pathAllowed, candidateUrl, createPrefetcher, boot };
  } else {
    boot(global);
  }
})(typeof window !== 'undefined' ? window : globalThis);
