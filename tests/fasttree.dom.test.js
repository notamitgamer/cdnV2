// Browser-glue tests for app/static/fasttree.js, run in jsdom with a fake Turbo.
// Needs jsdom (CI installs it; locally: `npm install --no-save --no-package-lock jsdom`).
// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  test('fasttree DOM tests', { skip: 'jsdom is not installed' }, () => {});
}

if (JSDOM) {
  const { boot } = require('../app/static/fasttree.js');

  const parts = {
    root_header: '[RH]', count: '<c>@@n@@ @@word@@@@s@@</c>', toolbar: '[TB:@@counts@@|@@path@@]', go_up: '[UP:@@parent_path@@]',
    row_dir: '[D:@@name@@]', row_file: '[F:@@name@@]', empty: '[EMPTY]', stats: '[ST:@@n@@@@s@@|@@size_str@@]',
    crumb_container: '[CC:@@inner@@|@@tail@@]', crumb_link: '<@@href@@:@@name@@>', crumb_collapsed: '[COL:@@menu@@]',
    copy_btn: '[CP:@@path@@]', visit: 'V(@@path_json@@)',
  };
  const shellV = (v) => ({ v, cdn_base: 'https://cdn.example.com', parts,
    html: 'PAGE<!--@root-header-->|<!--@breadcrumb-->|<!--@toolbar-->|<!--@list-->|<!--@stats-->|/*@visit*/' });
  const treeV = (v, files) => ({ v, n: files.length, files });
  const FILES = [['README.md', 10], ['bsc/a.pdf', 20], ['bsc/sem1/n.txt', 30], ['music/song.mp3', 40]];

  // Build a page with some links, boot the script against it, and return handles for assertions.
  function env({ stored, turbo = true, url = 'https://cdn.example.com/', fetchImpl, extraHead = '' } = {}) {
    const dom = new JSDOM(`<!doctype html><html><head>${extraHead}</head><body>
      <a id="folder" href="/bsc">bsc</a>
      <a id="deep" href="/bsc/sem1/">sem1</a>
      <a id="root" href="/">home</a>
      <a id="file" href="/README.md">readme</a>
      <a id="unknown" href="/nope">nope</a>
      <a id="query" href="/bsc?x=1">q</a>
      <a id="hash" href="/bsc#top">h</a>
      <a id="api" href="/api/get/bsc">api</a>
      <a id="admin" href="/admin">admin</a>
      <a id="blank" href="/bsc" target="_blank">b</a>
      <a id="dl" href="/bsc" download>d</a>
      <div data-turbo="false"><a id="noturbo" href="/bsc">n</a></div>
      <a id="offsite" href="https://example.org/bsc">o</a>
    </body></html>`, { url, pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
    const win = dom.window;
    if (stored !== undefined) win.localStorage.setItem('cdn_fast_v1', typeof stored === 'string' ? stored : JSON.stringify(stored));
    const visits = [];
    if (turbo) win.Turbo = { visit: (u, o) => visits.push({ url: u, ...o }) };
    win.fetch = fetchImpl || (() => Promise.reject(new Error('offline')));
    boot(win);
    const click = (id, init = {}) => {
      const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      win.document.getElementById(id).dispatchEvent(ev);
      return ev;
    };
    return { win, visits, click, api: win.__cdnFast };
  }
  const saved = (tv = 't1', sv = 's1', files = FILES) => ({ tree: { v: tv, files }, shell: shellV(sv) });
  const jsonResponse = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

  test('warm start: a saved tree is usable immediately, with no network', () => {
    const e = env({ stored: saved() });
    assert.equal(e.api.stats().ready, true);
    assert.equal(e.api.stats().files, 4);
  });

  test('clicking a folder link builds the page locally and hands it to Turbo', () => {
    const e = env({ stored: saved() });
    const ev = e.click('folder');
    assert.equal(ev.defaultPrevented, true);
    assert.equal(e.visits.length, 1);
    const v = e.visits[0];
    assert.equal(v.url, '/bsc');
    assert.equal(v.action, 'advance');
    assert.equal(v.response.statusCode, 200);
    assert.ok(v.response.responseHTML.startsWith('PAGE|[CC: </:root> / </bsc:bsc> |[CP:bsc]]|'), v.response.responseHTML);
    assert.ok(v.response.responseHTML.includes('[UP:/]'));
    assert.ok(v.response.responseHTML.includes('[D:sem1]') && v.response.responseHTML.includes('[F:a.pdf]'));
  });

  test('trailing slashes and the root work', () => {
    const e = env({ stored: saved() });
    assert.equal(e.click('deep').defaultPrevented, true);
    assert.equal(e.click('root').defaultPrevented, true);
    assert.deepEqual(e.visits.map((v) => v.url), ['/bsc/sem1/', '/']);
    assert.ok(e.visits[1].response.responseHTML.startsWith('PAGE[RH]|'));
  });

  test('everything else falls through to the normal navigation', () => {
    const e = env({ stored: saved() });
    for (const id of ['file', 'unknown', 'query', 'hash', 'api', 'admin', 'blank', 'dl', 'noturbo', 'offsite']) {
      assert.equal(e.click(id).defaultPrevented, false, id);
    }
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      assert.equal(e.click('folder', init).defaultPrevented, false, JSON.stringify(init));
    }
    assert.equal(e.visits.length, 0);
  });

  test('without a saved tree, without Turbo, or when the page opts out: no interception', () => {
    assert.equal(env({}).click('folder').defaultPrevented, false);
    assert.equal(env({ stored: saved(), turbo: false }).click('folder').defaultPrevented, false);
    assert.equal(env({ stored: saved(), extraHead: '<meta name="cdn-fast" content="off">' }).click('folder').defaultPrevented, false);
  });

  test('a corrupt or partial saved entry is ignored, not fatal', () => {
    for (const bad of ['{not json', '{}', JSON.stringify({ tree: { v: 'x' }, shell: {} }), 'null']) {
      const e = env({ stored: bad });
      assert.equal(e.api.stats().ready, false, bad);
      assert.equal(e.click('folder').defaultPrevented, false);
    }
  });

  test('an error while building falls back to the normal navigation', () => {
    const e = env({ stored: { tree: { v: 't', files: FILES }, shell: { v: 's', cdn_base: 'x', html: 'x', parts: { ...parts, row_dir: null } } } });
    assert.equal(e.click('folder').defaultPrevented, false);
    assert.equal(e.visits.length, 0);
  });

  test('handles(): what the prefetcher should leave alone', () => {
    const e = env({ stored: saved() });
    assert.equal(e.api.handles('/bsc'), true);
    assert.equal(e.api.handles('/README.md'), false);
    assert.equal(e.api.handles('/api/get/x'), false);
    assert.equal(e.api.handles('https://example.org/bsc'), false);
    assert.equal(env({}).api.handles('/bsc'), false);
  });

  test('refresh fetches the tree and shell, saves them, and enables local navigation', async () => {
    const calls = [];
    const e = env({ fetchImpl: (u) => { calls.push(u); return jsonResponse(u === '/api/tree' ? treeV('t9', FILES) : shellV('s9')); } });
    assert.equal(e.click('folder').defaultPrevented, false);   // nothing yet
    await e.api.refresh(true);
    assert.deepEqual(calls.sort(), ['/api/shell', '/api/tree']);
    assert.equal(e.api.stats().ready, true);
    assert.equal(JSON.parse(e.win.localStorage.getItem('cdn_fast_v1')).tree.v, 't9');
    assert.equal(e.click('folder').defaultPrevented, true);
  });

  test('forced refreshes arriving together share one request, plus one more afterwards', async () => {
    let n = 0;
    const e = env({ stored: saved(), fetchImpl: (u) => { n++; return jsonResponse(u === '/api/tree' ? treeV('t1', FILES) : shellV('s1')); } });
    await Promise.all([e.api.refresh(true), e.api.refresh(true), e.api.refresh(true)]);
    assert.equal(n, 4, 'two requests for the flight, two more for the single follow-up');
  });

  test('refresh is throttled unless forced, and an offline refresh keeps what it has', async () => {
    let n = 0;
    const e = env({ stored: saved(), fetchImpl: () => { n++; return Promise.reject(new Error('offline')); } });
    await e.api.refresh(true);
    const afterFirst = n;
    await e.api.refresh(false);
    assert.equal(n, afterFirst, 'throttled');
    assert.equal(e.api.stats().ready, true);
    assert.equal(e.click('folder').defaultPrevented, true);
  });

  test('a changed tree rebuilds the page on screen, but only if that page was built locally', async () => {
    const newer = (u) => jsonResponse(u === '/api/tree' ? treeV('t2', [...FILES, ['bsc/new.pdf', 5]]) : shellV('s1'));
    // 1) navigate locally to /bsc, then a newer tree arrives -> replace visit with the new content
    const e = env({ stored: saved(), fetchImpl: newer });
    e.click('folder');
    e.win.history.pushState({}, '', '/bsc');                    // what Turbo would do
    e.win.document.dispatchEvent(new e.win.Event('turbo:load'));  // marks the page as locally built
    await e.api.refresh(true);
    const last = e.visits[e.visits.length - 1];
    assert.equal(last.action, 'replace');
    assert.ok(last.response.responseHTML.includes('[F:new.pdf]'));
    // 2) a server-rendered page is never rebuilt behind the user's back
    const e2 = env({ stored: saved(), url: 'https://cdn.example.com/bsc', fetchImpl: newer });
    await e2.api.refresh(true);
    assert.equal(e2.visits.length, 0);
  });

  test('a folder deleted in the newer tree is re-requested from the server', async () => {
    const gone = (u) => jsonResponse(u === '/api/tree' ? treeV('t3', [['README.md', 1]]) : shellV('s1'));
    const e = env({ stored: saved(), fetchImpl: gone });
    e.click('folder');
    e.win.history.pushState({}, '', '/bsc');
    e.win.document.dispatchEvent(new e.win.Event('turbo:load'));
    await e.api.refresh(true);
    const last = e.visits[e.visits.length - 1];
    assert.deepEqual([last.url, last.action, last.response], ['/bsc', 'replace', undefined]);
  });

  test('a too-large tree switches the feature off and clears what was saved', async () => {
    const e = env({ stored: saved(), fetchImpl: (u) => jsonResponse(u === '/api/tree' ? { v: 'big', n: 99999, too_large: true } : shellV('s1')) });
    await e.api.refresh(true);
    assert.equal(e.api.stats().ready, false);
    assert.equal(e.win.localStorage.getItem('cdn_fast_v1'), null);
    assert.equal(e.click('folder').defaultPrevented, false);
  });
}
