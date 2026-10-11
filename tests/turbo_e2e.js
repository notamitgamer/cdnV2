// End-to-end check of instant folder navigation with the REAL Turbo and the REAL server-rendered pages.
// Not run directly: tests/test_fast_tree.py writes fixtures to a directory and calls
//   node tests/turbo_e2e.js <fixtures-dir>
// Needs jsdom and @hotwired/turbo@8.0.4 (CI installs both; locally: npm i --no-save --no-package-lock jsdom @hotwired/turbo@8.0.4).
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { boot } = require('../app/static/fasttree.js');

const dir = process.argv[2];
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const tree = JSON.parse(read('tree.json'));
const shell = JSON.parse(read('shell.json'));
const turboSrc = fs.readFileSync(require.resolve('@hotwired/turbo/dist/turbo.es2017-umd.js'), 'utf8');

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log((cond ? 'ok   - ' : 'FAIL - ') + msg); };
const norm = (s) => s.replace(/\s+/g, ' ').trim();
// The parts of a listing page that depend on the folder. (Whole-page equality is checked elsewhere.)
const region = (doc) => ['.breadcrumb-container', '.listing-toolbar', '#file-list', 'footer']
  .map((sel) => { const el = doc.querySelector(sel); return norm(el ? el.outerHTML : '(none)'); }).join('\n');
const waitFor = async (cond, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (cond()) return true; await new Promise((r) => setTimeout(r, 10)); } return cond(); };
const parse = (html) => new JSDOM(html).window.document;

(async () => {
  // The page the user is on: the server's own rendering of /bsc (external scripts are not loaded in jsdom).
  const stripExternal = (h) => h.replace(/<script[^>]*\bsrc="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(stripExternal(read('from.html')), {
    url: 'https://cdn.example.com/bsc', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  const win = dom.window;
  win.eval(turboSrc);                       // the real Turbo (what the CDN <script type=module> provides)
  check(typeof win.Turbo.visit === 'function', 'real Turbo 8.0.4 is loaded');
  win.localStorage.setItem('cdn_fast_v1', JSON.stringify({ tree: { v: tree.v, files: tree.files }, shell }));
  let networkCalls = 0;
  const requested = [];
  win.fetch = (u, o) => {
    const url = String(u && u.url || u);
    // the tree/shell revalidating in the background is expected; a page request is not
    if (url !== '/api/tree' && url !== '/api/shell') { networkCalls++; requested.push(`${url} (during step ${step})`); } return Promise.reject(new Error('the test forbids network requests')); };
  let step = 'start';
  const origPush = win.history.pushState.bind(win.history);
  const pushed = [];
  win.history.pushState = (...a) => { pushed.push(a[2]); return origPush(...a); };
  boot(win);

  step = 'click';
  const link = win.document.querySelector('#file-list a[href="/bsc/semester_1"]');
  check(!!link, 'the page has a link to the sub-folder');
  await waitFor(() => win.document.readyState === 'complete');
  await new Promise((r) => setTimeout(r, 100));   // let Turbo's own start-up settle
  link.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await waitFor(() => win.location.pathname === '/bsc/semester_1' && win.document.querySelector('a[href="/bsc/semester_1/deep"]'));

  check(win.location.pathname === '/bsc/semester_1', `the address changed to /bsc/semester_1 (is ${win.location.pathname})`);
  check(pushed.length === 1, 'Turbo added a history entry');
  check(networkCalls === 0, 'no page was requested from the server for the navigation');
  const got = region(win.document);
  const want = region(parse(read('to.html')));
  check(got === want, 'the page now on screen equals the server-rendered page for that folder');
  if (got !== want) {
    const i = [...got].findIndex((c, k) => c !== want[k]);
    console.log('   got : ...' + got.slice(Math.max(0, i - 80), i + 120) + '\n   want: ...' + want.slice(Math.max(0, i - 80), i + 120));
  }
  const visited = JSON.parse(win.localStorage.getItem('cdn_visited_v1') || '[]');
  check(visited.some((e) => e.type === 'folder' && e.path === 'bsc/semester_1'), "the page's own script recorded the visit in History");

  // Back to the page we came from (Turbo restores it), then forward again.
  step = 'back';
  win.history.back();
  await waitFor(() => win.location.pathname === '/bsc' && win.document.querySelector('#file-list a[href="/bsc/semester_1"]'));
  check(win.location.pathname === '/bsc', 'Back returns to /bsc');
  check(win.document.querySelector('#file-list a[href="/bsc/semester_1"]') !== null, '...and shows that folder\'s listing');

  // Going to the root from a deep page: header appears, breadcrumb disappears.
  step = 'root';
  win.document.querySelector('.wordmark').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await waitFor(() => win.location.pathname === '/' && win.document.querySelector('h1'));
  check(win.location.pathname === '/', 'the logo link goes to the root locally');
  check(win.document.querySelector('h1') !== null && win.document.querySelector('.breadcrumb-container') === null, 'root shows its header and no breadcrumb');
  check(region(win.document) === region(parse(read('root.html'))), 'the root page equals the server-rendered root page');
  check(networkCalls === 0, 'still no page requests (Back, logo link)' + (requested.length ? ': ' + requested.join(', ') : ''));

  console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nend-to-end navigation works');
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('FAIL - exception:', e); process.exit(1); });
