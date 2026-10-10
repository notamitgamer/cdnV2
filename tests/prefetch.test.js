// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, pathAllowed, candidateUrl, createPrefetcher } = require('../app/static/prefetch.js');

const BASE = new URL('https://cdn.example.com/photos/');
const link = (href, extra = {}) => ({ href, ...extra });
const pick = (href, extra) => candidateUrl(link(href, extra), BASE);

test('allows folders, files, and top-level pages', () => {
  assert.equal(pick('/uploads/'), 'https://cdn.example.com/uploads/');
  assert.equal(pick('/uploads/report.pdf'), 'https://cdn.example.com/uploads/report.pdf');
  assert.equal(pick('/find'), 'https://cdn.example.com/find');
  assert.equal(pick('/documentation'), 'https://cdn.example.com/documentation');
  assert.equal(pick('sub/dir'), 'https://cdn.example.com/photos/sub/dir'); // relative
});

test('never prefetches the app’s own endpoints, downloads or redirects', () => {
  for (const p of ['/api/get/uploads/big.zip', '/api/pack/uploads', '/admin', '/admin/x',
                   '/mask/abc123', '/pack/batch1', '/static/sw.js', '/raw/uploads/a.png',
                   '/favicon.ico']) {
    assert.equal(pick(p), null, p);
  }
});

test('reserved names only match whole path segments', () => {
  assert.equal(pathAllowed('/administrator/'), true);
  assert.equal(pathAllowed('/apikeys/'), true);
  assert.equal(pathAllowed('/api'), false);
  assert.equal(pathAllowed('/'), true);
});

test('skips other origins and non-http schemes', () => {
  assert.equal(pick('https://raw.cdn.example.com/uploads/a.png'), null);
  assert.equal(pick('https://example.org/'), null);
  assert.equal(pick('mailto:a@b.c'), null);
  assert.equal(pick('javascript:void(0)'), null);
});

test('respects opt-outs on the link', () => {
  assert.equal(pick('/uploads/', { download: true }), null);
  assert.equal(pick('/uploads/', { target: '_blank' }), null);
  assert.equal(pick('/uploads/', { target: '_self' }), 'https://cdn.example.com/uploads/');
  assert.equal(pick('/uploads/', { turboOff: true }), null);
  assert.equal(pick('/uploads/', { noPrefetch: true }), null);
});

test('skips the current page, strips hashes', () => {
  assert.equal(pick('/photos/'), null);
  assert.equal(pick('/photos/#top'), null);
  assert.equal(pick('/uploads/#x'), 'https://cdn.example.com/uploads/');
  assert.equal(pick('/photos/?q=1'), 'https://cdn.example.com/photos/?q=1');
});

// --- queue ---------------------------------------------------------------------------------------

// A fetch whose responses the test finishes by hand, so we can observe concurrency.
function manualFetch() {
  const calls = [];
  const fn = (url, signal) =>
    new Promise((resolve, reject) => {
      const call = { url, signal, resolve, reject, aborted: false };
      signal.addEventListener('abort', () => { call.aborted = true; reject(new Error('aborted')); });
      calls.push(call);
    });
  return { fn, calls };
}
const tick = () => new Promise((r) => setImmediate(r));
const urls = (n) => Array.from({ length: n }, (_, i) => `https://cdn.example.com/f${i}/`);

test('runs at most `concurrency` fetches at once and drains the queue', async () => {
  const { fn, calls } = manualFetch();
  const pf = createPrefetcher({ fetchFn: fn, config: { concurrency: 2, maxLinks: 10 } });
  pf.enqueue(urls(5));
  await tick();
  assert.equal(calls.length, 2);
  calls[0].resolve();
  await tick();
  assert.equal(calls.length, 3);
  calls.forEach((c) => c.resolve());
  await tick(); await tick();
  assert.equal(calls.length, 5);
});

test('stops accepting links after maxLinks per page view, and newPage resets the budget', async () => {
  const { fn } = manualFetch();
  const pf = createPrefetcher({ fetchFn: fn, config: { maxLinks: 3 } });
  assert.equal(pf.enqueue(urls(10)), 3);
  assert.equal(pf.remaining(), 0);
  assert.equal(pf.enqueue(urls(10)), 0);
  pf.newPage();
  assert.equal(pf.remaining(), 3);
});

test('does not refetch inside the TTL, does after it', async () => {
  let t = 1000;
  const { fn, calls } = manualFetch();
  const pf = createPrefetcher({ fetchFn: fn, now: () => t, config: { ttlMs: 50000, maxLinks: 10 } });
  pf.enqueue(urls(1));
  await tick();
  calls[0].resolve();
  await tick();
  pf.newPage();
  assert.equal(pf.enqueue(urls(1)), 0);   // still fresh
  t += 60000;
  assert.equal(pf.enqueue(urls(1)), 1);   // expired
});

test('does not queue a URL that is already in flight', async () => {
  const { fn } = manualFetch();
  const pf = createPrefetcher({ fetchFn: fn, config: { maxLinks: 10 } });
  pf.enqueue(urls(1));
  await tick();
  pf.newPage();
  assert.equal(pf.enqueue(urls(1)), 0);
});

test('abort cancels in-flight requests and clears the queue', async () => {
  const { fn, calls } = manualFetch();
  const pf = createPrefetcher({ fetchFn: fn, config: { concurrency: 1, maxLinks: 10 } });
  pf.enqueue(urls(4));
  await tick();
  pf.abort();
  await tick();
  assert.equal(calls[0].aborted, true);
  assert.equal(calls.length, 1);          // nothing else started
  assert.equal(pf.stats().queued, 0);
  // an aborted fetch is not remembered as done, so it can be tried again later
  pf.newPage();
  assert.equal(pf.enqueue(urls(1)), 1);
});

test('a failing fetch does not stall the queue and is not retried in a loop', async () => {
  const { fn, calls } = manualFetch();
  const pf = createPrefetcher({ fetchFn: fn, config: { concurrency: 1, maxLinks: 10 } });
  pf.enqueue(urls(2));
  await tick();
  calls[0].reject(new Error('network'));
  await tick(); await tick();
  assert.equal(calls.length, 2);          // moved on to the next one
  pf.newPage();
  assert.equal(pf.enqueue(urls(1)), 0);   // failed URL remembered for the TTL
});

test('paused queue holds work until resumed', async () => {
  const { fn, calls } = manualFetch();
  const pf = createPrefetcher({ fetchFn: fn, config: { concurrency: 2, maxLinks: 10 } });
  pf.setPaused(true);
  pf.enqueue(urls(3));
  await tick();
  assert.equal(calls.length, 0);
  pf.setPaused(false);
  await tick();
  assert.equal(calls.length, 2);
});

test('abort(keepUrl) leaves the page being opened running and cancels the rest', async () => {
  const { fn, calls } = manualFetch();
  const pf = createPrefetcher({ fetchFn: fn, config: { concurrency: 3, maxLinks: 10 } });
  const [a, b, c] = urls(3);
  pf.enqueue([a, b, c, ...urls(6).slice(3)]);
  await tick();
  pf.abort(b);
  await tick();
  assert.deepEqual(calls.map((x) => x.aborted), [true, false, true]);
  assert.equal(pf.stats().queued, 0);
  calls[1].resolve();           // the kept request finishes normally and is remembered
  await tick(); await tick();
  pf.newPage();
  assert.equal(pf.enqueue([b]), 0);
});

test('prefetch TTL is shorter than the pages\' browser-cache lifetime (30 s)', () => {
  assert.ok(DEFAULTS.ttlMs < 30000);
});
