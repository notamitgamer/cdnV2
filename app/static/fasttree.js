/*!
 * cdnV2 instant folder navigation.
 *
 * The browser keeps the whole file tree (/api/tree) and a page "shell" (/api/shell) in localStorage.
 * Clicking a link to a folder then builds that folder's page locally and hands it to Turbo, so there is
 * no request at all: it works on the very first click after a page loads, even before any prefetch,
 * which is what people who know where they're going do.
 *
 * All HTML comes from the server's own templates (templates/_listing.html); this file only fills in the
 * data. tests/test_fast_tree.py checks that a locally built page equals the server-rendered one.
 *
 * Safe by construction: anything unusual (no tree yet, unknown folder, modified click, query/hash in the
 * URL, any error) falls through to the normal request, so the worst case is today's behaviour. The tree
 * is revalidated in the background (ETag, so an unchanged tree is a tiny 304); if it turns out the page
 * you are on was built from an older tree, it is quietly rebuilt. Trees above FAST_TREE_MAX_FILES on the
 * server are not shipped and the feature switches itself off.
 *
 * Opt out per page: <meta name="cdn-fast" content="off">.
 */
(function (global) {
  'use strict';

  const STORE_KEY = 'cdn_fast_v1';
  const MIN_REFRESH_MS = 15000;
  const HIDDEN_ROW = '.gitattributes'; // rows the listing template skips
  // First path segments that belong to the app, never to the CDN's content (same list as prefetch.js).
  const RESERVED = new Set(['api', 'admin', 'mask', 'pack', 'static', 'raw']);

  // --- text helpers: byte-for-byte what Jinja produces ---------------------------------------------

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };
  // markupsafe.escape
  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, (c) => ESC[c]);
  }

  // Jinja's |tojson: ASCII-only JSON, with <, >, & and ' as \u escapes (safe inside <script>).
  function jsonForScript(v) {
    return JSON.stringify(v)
      .replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/'/g, '\\u0027');
  }

  // storage.format_size. Python rounds half to even on the exact value, JavaScript's toFixed rounds
  // half up, and 1.125 KB is exactly representable, so do the arithmetic exactly with BigInt.
  function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const n = BigInt(Math.trunc(bytes));
    let idx = 0;
    let d = 1n;
    while (n >= d * 1024n && idx < units.length - 1) {
      d *= 1024n;
      idx++;
    }
    if (idx === 0) return `${n} ${units[0]}`;
    const scaled = n * 100n;
    let q = scaled / d;
    const r2 = (scaled % d) * 2n;
    if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
    return `${q / 100n}.${(q % 100n).toString().padStart(2, '0')} ${units[idx]}`;
  }

  // --- the tree --------------------------------------------------------------------------------------

  // files: [[path, size], ...]  ->  folder index
  function buildIndex(files) {
    const folders = new Map(); // folder path -> { dirs: Set(name), files: [[name, size]] }
    const get = (p) => {
      let f = folders.get(p);
      if (!f) folders.set(p, (f = { dirs: new Set(), files: [] }));
      return f;
    };
    get('');
    let bytes = 0;
    for (const [path, size] of files) {
      const segs = path.split('/');
      const name = segs.pop();
      let parent = '';
      for (const seg of segs) {
        get(parent).dirs.add(seg);
        parent = parent ? parent + '/' + seg : seg;
        get(parent);
      }
      get(parent).files.push([name, size]);
      bytes += size;
    }
    return { folders, count: files.length, bytes };
  }

  // Same items, same order as storage.list_directory: folders first, then by lower-cased name.
  function listFolder(index, path) {
    const f = index.folders.get(path);
    if (!f) return null;
    const prefix = path ? path + '/' : '';
    const cmp = (a, b) => {
      const x = a.name.toLowerCase();
      const y = b.name.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    };
    const dirs = [...f.dirs].map((n) => ({ name: n, path: prefix + n, is_dir: true, size_str: '-' }));
    const files = f.files.map(([n, s]) => ({ name: n, path: prefix + n, is_dir: false, size_str: formatSize(s) }));
    return dirs.sort(cmp).concat(files.sort(cmp));
  }

  // --- building a page -------------------------------------------------------------------------------

  // Replace @@key@@ in one pass, so a value that happens to contain "@@x@@" is never expanded again.
  function fill(tpl, map) {
    return tpl.replace(/@@([a-z_]+)@@/g, (m, k) => (Object.prototype.hasOwnProperty.call(map, k) ? map[k] : m));
  }

  function breadcrumb(path, parts) {
    const crumbs = [{ name: 'root', href: '/' }];
    let cur = '';
    for (const seg of path.split('/')) {
      cur += seg + '/';
      crumbs.push({ name: seg, href: '/' + cur.slice(0, -1) });
    }
    const link = (c) => fill(parts.crumb_link, { href: escapeHtml(c.href), name: escapeHtml(c.name) });
    const last = crumbs.length - 1;
    let inner;
    if (crumbs.length > 4) {
      // root, "...", then the last two; the folders in between go into the "..." menu
      const menu = ' ' + crumbs.slice(1, -2).map(link).join(' ') + ' ';
      inner = [link(crumbs[0]), fill(parts.crumb_collapsed, { menu }), '/ ' + link(crumbs[last - 1]), '/ ' + link(crumbs[last])].join(' ');
    } else {
      inner = crumbs.map((c, i) => (i === 0 ? link(c) : '/ ' + link(c))).join(' ');
    }
    return fill(parts.crumb_container, { inner: ' ' + inner + ' ', tail: fill(parts.copy_btn, { path: escapeHtml(path) }) });
  }

  const SLOT_RE = /<!--@(?:root-header|breadcrumb|toolbar|list|stats)-->|\/\*@visit\*\//g;

  // The complete HTML of the page for folder `path` ('' is the root), or null if the tree has no such folder.
  function compose(shell, index, path) {
    const items = listFolder(index, path);
    if (!items) return null;
    const p = shell.parts;
    const visible = items.filter((i) => i.name !== HIDDEN_ROW);
    const dirs = visible.filter((i) => i.is_dir).length;
    const files = visible.length - dirs;
    const segs = path ? path.split('/') : [];
    const parent = segs.length > 1 ? '/' + segs.slice(0, -1).join('/') : '/';

    const count = (n, word) => fill(p.count, { n: String(n), word, s: n === 1 ? '' : 's' });
    let counts = '';
    if (dirs > 0) counts += count(dirs, 'folder');
    if (dirs > 0 && files > 0) counts += ' &amp; ';
    if (files > 0) counts += count(files, 'file');
    if (dirs === 0 && files === 0) counts += '0 items';

    const rows = visible.map((i) =>
      i.is_dir
        ? fill(p.row_dir, { name: escapeHtml(i.name), path: escapeHtml(i.path) })
        : fill(p.row_file, { name: escapeHtml(i.name), path: escapeHtml(i.path), size_str: escapeHtml(i.size_str) })
    );
    let list = path ? fill(p.go_up, { parent_path: escapeHtml(parent) }) + '\n' : '';
    list += rows.join('\n');
    if (visible.length === 0) list += '\n' + p.empty;

    const values = {
      '<!--@root-header-->': path ? '' : p.root_header,
      '<!--@breadcrumb-->': path ? breadcrumb(path, p) : '',
      '<!--@toolbar-->': items.length ? fill(p.toolbar, { counts: ' ' + counts + ' ', path: escapeHtml(path) }) : '',
      '<!--@list-->': list,
      '<!--@stats-->': fill(p.stats, { n: String(index.count), s: index.count === 1 ? '' : 's', size_str: formatSize(index.bytes) }),
      '/*@visit*/': path
        ? fill(p.visit, { path_json: jsonForScript(path), cdn_url_json: jsonForScript(shell.cdn_base + '/' + path + '/') })
        : '',
    };
    return shell.html.replace(SLOT_RE, (m) => values[m]);
  }

  // '/a%26b/x/' -> 'a&b/x'; null when the URL is not a plain content path.
  function folderPathFromUrl(url) {
    if (url.search || url.hash) return null;
    let p;
    try {
      p = decodeURIComponent(url.pathname);
    } catch (e) {
      return null;
    }
    p = p.replace(/^\/+|\/+$/g, '');
    if (RESERVED.has(p.split('/')[0])) return null;
    return p;
  }

  // --- in the browser --------------------------------------------------------------------------------

  function boot(win) {
    const doc = win.document;
    if (!doc || win.__cdnFast || typeof win.fetch !== 'function') return;

    const state = { tree: null, shell: null, lastCheck: 0, disabled: false, pending: null, local: null };

    function install(tree, shell) {
      state.tree = { v: tree.v, files: tree.files, index: buildIndex(tree.files) };
      state.shell = shell;
    }
    function persist() {
      try {
        win.localStorage.setItem(
          STORE_KEY,
          JSON.stringify({ tree: { v: state.tree.v, files: state.tree.files }, shell: state.shell })
        );
      } catch (e) { /* storage full or blocked: still works for this session */ }
    }

    // Warm start: what we saved on the last visit is usable immediately, before any network.
    try {
      const saved = JSON.parse(win.localStorage.getItem(STORE_KEY) || 'null');
      if (saved && saved.tree && saved.tree.files && saved.shell && saved.shell.parts) install(saved.tree, saved.shell);
    } catch (e) { /* corrupt entry: refetched below */ }

    const turboReady = () => !!(win.Turbo && typeof win.Turbo.visit === 'function');
    const optedOut = () => !!doc.querySelector('meta[name="cdn-fast"][content="off"]');
    const ready = () => !state.disabled && !!state.tree && !!state.shell && turboReady() && !optedOut();

    function pathFor(url) {
      if (!ready() || url.origin !== win.location.origin) return null;
      const path = folderPathFromUrl(url);
      return path !== null && state.tree.index.folders.has(path) ? path : null;
    }

    function visit(url, path, action) {
      const html = compose(state.shell, state.tree.index, path);
      if (html === null) return false;
      state.pending = { path, treeV: state.tree.v };
      win.Turbo.visit(url.pathname, { action, response: { statusCode: 200, responseHTML: html } });
      return true;
    }

    function onClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest && e.target.closest('a[href]');
      if (!a || !ready()) return;
      if (a.hasAttribute('download') || (a.target && a.target !== '_self') || a.closest('[data-turbo="false"]')) return;
      try {
        const url = new URL(a.href, win.location.href);
        const path = pathFor(url);
        if (path === null) return;
        // Turbo ignores a click that has been default-prevented, so it doesn't also fetch the page.
        if (visit(url, path, 'advance')) e.preventDefault();
      } catch (err) {
        state.pending = null; // anything odd: let the normal navigation happen
      }
    }
    doc.addEventListener('click', onClick, true);

    function getJson(url) {
      return win.fetch(url, { credentials: 'same-origin', priority: 'low' }).then((r) => {
        if (!r.ok) throw new Error(url + ' ' + r.status);
        return r.json();
      });
    }

    // If the page on screen was built from an older tree than the one we now have, rebuild it.
    function reconcile() {
      const here = state.local;
      if (!here || !state.tree || here.treeV === state.tree.v) return;
      let url;
      try {
        url = new URL(win.location.href);
      } catch (e) {
        return;
      }
      if (folderPathFromUrl(url) !== here.path) return;
      if (!visit(url, here.path, 'replace')) win.Turbo.visit(url.pathname, { action: 'replace' }); // folder is gone: ask the server
    }

    let inflight = null;
    let again = false;
    function refresh(force) {
      const now = Date.now();
      if (!force && now - state.lastCheck < MIN_REFRESH_MS) return Promise.resolve();
      // One request at a time. A forced refresh that arrives mid-flight (e.g. several files finishing
      // uploading together) runs once more afterwards, because the flight may have started too early.
      if (inflight) {
        if (force) again = true;
        return inflight;
      }
      state.lastCheck = now;
      inflight = Promise.all([getJson('/api/tree'), getJson('/api/shell')])
        .then(([tree, shell]) => {
          if (tree.too_large) {
            state.disabled = true;
            try { win.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
            return;
          }
          if (state.tree && state.shell && state.tree.v === tree.v && state.shell.v === shell.v) return;
          install(tree, shell);
          persist();
          if (turboReady()) reconcile();
        })
        .catch(() => { /* offline, or the server is busy: keep what we have */ })
        .then(() => {
          inflight = null;
          if (again) {
            again = false;
            return refresh(true);
          }
        });
      return inflight;
    }

    // Keep the tree fresh without ever blocking anything.
    const idle = (fn) => (win.requestIdleCallback ? win.requestIdleCallback(fn, { timeout: 2000 }) : win.setTimeout(fn, 300));
    const start = () => idle(() => refresh(false));
    if (doc.readyState !== 'loading') start();
    else doc.addEventListener('DOMContentLoaded', start, { once: true });

    doc.addEventListener('turbo:before-visit', () => { if (!state.pending) state.local = null; });
    doc.addEventListener('turbo:load', () => {
      if (state.pending) {
        state.local = state.pending;
        state.pending = null;
      }
      idle(() => refresh(false));
    });
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) refresh(false); });

    win.__cdnFast = {
      refresh, // refresh(true) forces a check, e.g. right after an upload
      handles: (url) => {
        try {
          return pathFor(new URL(url, win.location.href)) !== null;
        } catch (e) {
          return false;
        }
      },
      stats: () => ({ ready: ready(), files: state.tree ? state.tree.index.count : 0, treeVersion: state.tree && state.tree.v, shellVersion: state.shell && state.shell.v }),
    };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { escapeHtml, jsonForScript, formatSize, buildIndex, listFolder, compose, folderPathFromUrl, boot };
  } else {
    boot(global);
  }
})(typeof window !== 'undefined' ? window : globalThis);
