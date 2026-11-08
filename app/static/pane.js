/*!
 * cdnV2 side pane: bookmarks + recent "jumps" at the root, a GitHub-style file tree inside folders.
 *
 * - The markup is static (templates/_sidebar.html) and marked data-turbo-permanent, so Turbo keeps this
 *   element (and everything built in it) across page visits; expanded folders do not reset on each click.
 * - The tree comes from the file index fasttree.js already keeps in localStorage (cdn_fast_v1), so there
 *   are no extra requests. If the tree is unavailable (too large, not fetched yet) the pane still shows
 *   bookmarks, jumps and tools, and picks the tree up as soon as it arrives (the "cdn:tree" event).
 * - Bookmarks live in this browser only (cdn_bookmarks_v1), like the visited-links history.
 * - Everything user-controlled (file names) is inserted with textContent, never as HTML.
 */
(function () {
  'use strict';
  if (window.__cdnPane) return;
  window.__cdnPane = true;

  const K_BM = 'cdn_bookmarks_v1';
  const K_PANE = 'cdn_pane_v1';
  const K_TREE = 'cdn_fast_v1';
  const K_VISITED = 'cdn_visited_v1';
  const MAX_ROWS = 500; // per expanded folder; the rest is one click away on the folder's own page
  const MAX_JUMPS = 8;
  const DESKTOP = window.matchMedia ? window.matchMedia('(min-width: 821px)') : { matches: true, addEventListener() {} };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
    json(k) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? [] : v; } catch (e) { return []; } },
  };

  // --- icons (static markup only) ----------------------------------------------------------------
  const PATHS = {
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
    chevron: '<polyline points="9 18 15 12 9 6"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    sync: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    bars: '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  };
  function icon(name, size, filled) {
    const s = document.createElement('span');
    s.className = 'pane-ico pane-ico--' + name;
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none') +
      '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + PATHS[name] + '</svg>';
    return s;
  }
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const hrefFor = (path) => '/' + path.split('/').map(encodeURIComponent).join('/');
  const baseName = (p) => p.split('/').pop();

  // --- the tree (read from fasttree's cache) -------------------------------------------------------
  let rawSeen = null;
  let index = null; // Map: folder path -> { dirs: string[], files: string[] }
  function getIndex() {
    const raw = ls.get(K_TREE);
    if (raw === rawSeen) return index;
    rawSeen = raw;
    index = null;
    if (!raw) return null;
    try {
      const saved = JSON.parse(raw);
      const files = saved && saved.tree && saved.tree.files;
      if (!Array.isArray(files)) return null;
      const m = new Map();
      const get = (p) => { let f = m.get(p); if (!f) m.set(p, (f = { dirs: new Set(), files: [] })); return f; };
      get('');
      for (const entry of files) {
        const path = entry[0];
        if (typeof path !== 'string' || baseName(path) === '.gitattributes') continue;
        const segs = path.split('/');
        const name = segs.pop();
        let acc = '';
        for (const seg of segs) {
          const next = acc ? acc + '/' + seg : seg;
          get(acc).dirs.add(seg);
          get(next);
          acc = next;
        }
        get(acc).files.push(name);
      }
      const cmp = (a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;
      for (const f of m.values()) { f.dirs = Array.from(f.dirs).sort(cmp); f.files.sort(cmp); }
      index = m;
    } catch (e) { index = null; }
    return index;
  }

  // --- bookmarks -----------------------------------------------------------------------------------
  const bookmarks = () => ls.json(K_BM).filter((b) => b && typeof b.path === 'string');
  const isBookmarked = (path) => bookmarks().some((b) => b.path === path);
  function toggleBookmark(path, type) {
    const list = bookmarks();
    const i = list.findIndex((b) => b.path === path);
    if (i >= 0) list.splice(i, 1); else list.unshift({ path, type, ts: Date.now() });
    ls.set(K_BM, JSON.stringify(list.slice(0, 100)));
    render();
  }

  // --- state ---------------------------------------------------------------------------------------
  const state = { mode: 'quick', expanded: new Set(['']), lastPath: null, cur: { kind: 'other', path: '', page: '' } };

  function current() {
    const page = (document.body && document.body.dataset.page) || '';
    let path = '';
    try { path = decodeURIComponent(location.pathname); } catch (e) { path = location.pathname; }
    path = path.replace(/^\/+|\/+$/g, '');
    if (page === 'listing') return { kind: 'folder', path, page };
    if (page === 'file') return { kind: 'file', path, page };
    return { kind: 'other', path: '', page };
  }

  function sync() {
    state.cur = current();
    const moved = state.lastPath !== location.pathname;
    state.lastPath = location.pathname;
    if (moved) {
      const c = state.cur;
      // inside a folder (or on a file) -> the tree; root and the tool pages -> bookmarks and jumps
      state.mode = (c.kind === 'folder' && c.path) || c.kind === 'file' ? 'tree' : 'quick';
      if (c.kind !== 'other') {
        const segs = c.path ? c.path.split('/') : [];
        if (c.kind === 'file') segs.pop();
        let acc = '';
        for (const s of segs) { acc = acc ? acc + '/' + s : s; state.expanded.add(acc); }
      }
    }
    render(moved);
  }

  // --- rendering -----------------------------------------------------------------------------------
  function row(opts) {
    const r = el('div', 'pane-row' + (opts.active ? ' is-active' : ''));
    if (opts.depth) r.style.paddingLeft = (0.4 + opts.depth * 0.95) + 'rem';
    if (opts.twisty) {
      const t = el('button', 'pane-twisty' + (opts.open ? ' is-open' : ''));
      t.type = 'button';
      t.setAttribute('data-pane-expand', opts.path);
      t.setAttribute('aria-label', (opts.open ? 'Collapse ' : 'Expand ') + (opts.label || 'root'));
      t.setAttribute('aria-expanded', String(!!opts.open));
      t.appendChild(icon('chevron', 14));
      r.appendChild(t);
    } else {
      r.appendChild(el('span', 'pane-twisty pane-twisty--none'));
    }
    const a = el('a', 'pane-link' + (opts.isFile ? ' file-link' : ''));
    a.href = opts.href;
    if (opts.active) a.setAttribute('aria-current', 'page');
    a.appendChild(icon(opts.icon, 16));
    a.appendChild(el('span', 'pane-link__text', opts.label));
    a.title = opts.title || opts.label;
    r.appendChild(a);
    if (opts.pin) {
      const on = isBookmarked(opts.path);
      const b = el('button', 'pane-pin' + (on ? ' is-on' : ''));
      b.type = 'button';
      b.setAttribute('data-pane-pin', opts.path);
      b.setAttribute('data-pane-type', opts.isFile ? 'file' : 'folder');
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', (on ? 'Remove bookmark: ' : 'Bookmark: ') + (opts.label || 'root'));
      b.appendChild(icon('star', 14, on));
      r.appendChild(b);
    }
    return r;
  }

  function section(title) {
    const s = el('section', 'pane-sec');
    s.appendChild(el('h3', 'pane-sec__title', title));
    return s;
  }

  function renderQuick(body) {
    const c = state.cur;
    // bookmark the place you are on
    if ((c.kind === 'folder' && c.path) || c.kind === 'file') {
      const on = isBookmarked(c.path);
      const b = el('button', 'btn btn-sm pane-here' + (on ? ' is-on' : ''));
      b.type = 'button';
      b.setAttribute('data-pane-pin', c.path);
      b.setAttribute('data-pane-type', c.kind);
      b.setAttribute('aria-pressed', String(on));
      b.appendChild(icon('star', 14, on));
      b.appendChild(el('span', '', on ? 'Bookmarked' : 'Bookmark this ' + c.kind));
      body.appendChild(b);
    }

    const bms = bookmarks();
    const sBm = section('Bookmarks');
    if (!bms.length) sBm.appendChild(el('p', 'pane-empty', 'Pin folders and files with the star and they show up here.'));
    for (const b of bms) {
      const dir = b.type !== 'file';
      sBm.appendChild(row({ icon: dir ? 'folder' : 'file', label: baseName(b.path) + (dir ? '/' : ''), title: b.path, href: hrefFor(b.path), path: b.path, isFile: !dir, pin: true, active: c.path === b.path && c.kind !== 'other' }));
    }
    body.appendChild(sBm);

    const visited = ls.json(K_VISITED).filter((v) => v && typeof v.path === 'string' && v.path).slice(0, MAX_JUMPS);
    const sJump = section('Jumps');
    if (!visited.length) sJump.appendChild(el('p', 'pane-empty', 'Places you open will be listed here.'));
    for (const v of visited) {
      const dir = v.type === 'folder';
      sJump.appendChild(row({ icon: dir ? 'folder' : 'file', label: baseName(v.path) + (dir ? '/' : ''), title: v.path, href: hrefFor(v.path), path: v.path, isFile: !dir }));
    }
    body.appendChild(sJump);

    const tools = [
      ['/', 'All files', 'home', 'listing'], ['/shorten', 'URL shortener', 'link', 'shorten'], ['/gh-sync', 'GitHub sync', 'sync', 'gh-sync'],
      ['/documentation', 'Docs', 'book', 'documentation'], ['/history', 'History', 'clock', 'history'], ['/stats', 'Stats', 'bars', 'stats'], ['/admin', 'Admin', 'shield', 'admin'],
    ];
    const sTools = section('Tools');
    for (const [href, label, ic, key] of tools) {
      const active = key === 'listing' ? (c.kind === 'folder' && !c.path) : c.page === key;
      const r = row({ icon: ic, label, href, active });
      sTools.appendChild(r);
    }
    body.appendChild(sTools);
  }

  function renderTree(body) {
    const idx = getIndex();
    if (!idx) {
      body.appendChild(el('p', 'pane-empty', 'The file tree is not loaded yet. It appears here as soon as it is ready.'));
      return;
    }
    const c = state.cur;
    const frag = document.createDocumentFragment();
    const walk = (path, depth) => {
      const f = idx.get(path);
      if (!f) return;
      let shown = 0;
      for (const d of f.dirs) {
        if (shown >= MAX_ROWS) break;
        const p = path ? path + '/' + d : d;
        const open = state.expanded.has(p);
        frag.appendChild(row({ icon: 'folder', label: d, href: hrefFor(p), path: p, depth, twisty: true, open, pin: true, active: c.kind === 'folder' && c.path === p }));
        shown++;
        if (open) walk(p, depth + 1);
      }
      for (const n of f.files) {
        if (shown >= MAX_ROWS) break;
        const p = path ? path + '/' + n : n;
        frag.appendChild(row({ icon: 'file', label: n, href: hrefFor(p), path: p, depth, isFile: true, pin: true, active: c.kind === 'file' && c.path === p }));
        shown++;
      }
      const total = f.dirs.length + f.files.length;
      if (total > shown) {
        const more = el('a', 'pane-more', '+' + (total - shown) + ' more, open the folder');
        more.href = hrefFor(path);
        more.style.marginLeft = (0.4 + depth * 0.95 + 1.6) + 'rem';
        frag.appendChild(more);
      }
    };
    frag.appendChild(row({ icon: 'home', label: 'root', title: 'All files', href: '/', path: '', twisty: true, open: state.expanded.has(''), active: c.kind === 'folder' && !c.path }));
    if (state.expanded.has('')) walk('', 1);
    body.appendChild(frag);
  }

  function render(scrollToActive) {
    const pane = $('#pane');
    const body = $('#pane-body');
    if (!pane || !body) return;
    $$('[data-pane-mode]', pane).forEach((b) => {
      const on = b.getAttribute('data-pane-mode') === state.mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    const keep = body.scrollTop;
    body.replaceChildren();
    body.setAttribute('data-mode', state.mode);
    if (state.mode === 'tree') renderTree(body); else renderQuick(body);
    body.scrollTop = keep;
    if (scrollToActive && state.mode === 'tree') {
      const a = $('.pane-row.is-active', body);
      if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
    }
  }

  // --- open / close --------------------------------------------------------------------------------
  const root = document.documentElement;
  function setOpen(open) {
    if (open) root.setAttribute('data-pane-open', ''); else root.removeAttribute('data-pane-open');
    $$('.nav-toggle').forEach((b) => b.setAttribute('aria-expanded', String(open)));
  }
  function toggle() {
    if (DESKTOP.matches) {
      const off = root.getAttribute('data-pane') === 'off';
      if (off) { root.removeAttribute('data-pane'); ls.del(K_PANE); } else { root.setAttribute('data-pane', 'off'); ls.set(K_PANE, 'off'); }
      $$('.nav-toggle').forEach((b) => b.setAttribute('aria-expanded', String(off)));
    } else {
      setOpen(!root.hasAttribute('data-pane-open'));
      if (root.hasAttribute('data-pane-open')) { const first = $('#pane .pane-tab.is-active') || $('#pane a'); if (first) first.focus({ preventScroll: true }); }
    }
  }

  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const tog = t.closest('[data-action="pane-toggle"]');
    if (tog) { e.preventDefault(); e.stopPropagation(); toggle(); return; }
    const mode = t.closest('[data-pane-mode]');
    if (mode) { state.mode = mode.getAttribute('data-pane-mode') === 'tree' ? 'tree' : 'quick'; render(true); return; }
    const exp = t.closest('[data-pane-expand]');
    if (exp) {
      const p = exp.getAttribute('data-pane-expand');
      if (state.expanded.has(p)) state.expanded.delete(p); else state.expanded.add(p);
      render(false);
      return;
    }
    const pin = t.closest('[data-pane-pin]');
    if (pin) { toggleBookmark(pin.getAttribute('data-pane-pin'), pin.getAttribute('data-pane-type') === 'file' ? 'file' : 'folder'); return; }
    // following a link inside the drawer closes it (phones)
    if (t.closest('#pane a[href]') && !DESKTOP.matches) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.hasAttribute('data-pane-open')) { setOpen(false); const b = $('.nav-toggle'); if (b) b.focus(); }
  });

  // swipe the drawer shut
  let sx = null;
  document.addEventListener('touchstart', (e) => { sx = e.target instanceof Element && e.target.closest('#pane') && e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (dx < -60) setOpen(false);
  }, { passive: true });

  const onChange = () => { setOpen(false); };
  if (DESKTOP.addEventListener) DESKTOP.addEventListener('change', onChange);

  // --- lifecycle -----------------------------------------------------------------------------------
  document.addEventListener('turbo:load', () => { setOpen(false); sync(); });
  document.addEventListener('cdn:tree', () => render(false));
  window.addEventListener('storage', (e) => { if (e.key === K_BM || e.key === K_VISITED || e.key === K_TREE) render(false); });
  // the visited list is written by an inline script on each page; draw again once that has run
  document.addEventListener('turbo:render', () => setTimeout(() => render(false), 0));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else sync();
})();
