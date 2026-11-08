/*!
 * cdnV2 listing helpers:
 *  - select files/folders (checkboxes) and act on them from a bottom bar: download, copy link,
 *    and delete (only offered when the admin token from /admin is held in this tab's sessionStorage).
 *  - on phones, the floating upload button tucks away while scrolling down so it never sits on top of rows.
 * Rows are rendered by the server template or composed by fasttree.js, so checkboxes are added here, after render,
 * rather than in the templates. File names are only ever written with textContent.
 */
(function () {
  'use strict';
  if (window.__cdnListing) return;
  window.__cdnListing = true;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const root = document.documentElement;
  const sel = new Map(); // path -> { type: 'file' | 'folder', row }

  const onListing = () => document.body && document.body.dataset.page === 'listing' && $('#file-list');
  const adminToken = () => { try { return sessionStorage.getItem('t') || ''; } catch (e) { return ''; } };

  function toast(msg, type) {
    const region = $('#toasts');
    if (!region) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast--' + type : '');
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    region.appendChild(el);
    while (region.children.length > 3) region.removeChild(region.firstChild);
    setTimeout(() => el.remove(), 3200);
  }

  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* legacy path */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }

  // --- rows ----------------------------------------------------------------------------------------
  function rowInfo(row) {
    if (row.dataset.name === '..') return null;
    const a = $('a.folder-link, a.file-link', row);
    if (!a) return null;
    let path = a.getAttribute('href') || '';
    try { path = decodeURIComponent(path); } catch (e) { /* keep as is */ }
    path = path.replace(/^\/+|\/+$/g, '');
    return path ? { path, type: a.classList.contains('folder-link') ? 'folder' : 'file' } : null;
  }

  function decorate() {
    if (!onListing()) { clear(true); removeBar(); return; }
    $$('#file-list .list-item').forEach((row) => {
      if ($('.sel-box', row)) return;
      const info = rowInfo(row);
      if (!info) return;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'sel-box';
      box.setAttribute('aria-label', 'Select ' + (row.dataset.name || info.path));
      box.checked = sel.has(info.path);
      row.insertBefore(box, row.firstChild);
      row.classList.toggle('is-selected', box.checked);
    });
    renderBar();
  }

  function setSelected(row, on) {
    const info = rowInfo(row);
    if (!info) return;
    if (on) sel.set(info.path, { type: info.type, row }); else sel.delete(info.path);
    row.classList.toggle('is-selected', on);
    const box = $('.sel-box', row);
    if (box) box.checked = on;
    renderBar();
  }

  function clear(silent) {
    sel.forEach((v) => { v.row.classList.remove('is-selected'); const b = $('.sel-box', v.row); if (b) b.checked = false; });
    sel.clear();
    if (!silent) renderBar();
    else root.removeAttribute('data-selecting');
  }

  // --- action bar ----------------------------------------------------------------------------------
  function removeBar() { const b = $('#sel-bar'); if (b) b.remove(); root.removeAttribute('data-selecting'); }

  function btn(label, action, cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-sm ' + (cls || ''); b.dataset.selAction = action; b.textContent = label;
    return b;
  }

  function renderBar() {
    if (!onListing()) return;
    let bar = $('#sel-bar');
    if (!sel.size) { if (bar) bar.remove(); root.removeAttribute('data-selecting'); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sel-bar'; bar.className = 'sel-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Selected items');
      document.body.appendChild(bar);
    }
    bar.replaceChildren();
    const count = document.createElement('span');
    count.className = 'sel-bar__count'; count.setAttribute('aria-live', 'polite');
    count.textContent = sel.size + ' selected';
    bar.appendChild(count);
    const actions = document.createElement('div');
    actions.className = 'sel-bar__actions';
    actions.appendChild(btn('Select all', 'all'));
    actions.appendChild(btn('Download', 'download'));
    actions.appendChild(btn('Copy link', 'copy'));
    if (adminToken()) actions.appendChild(btn('Delete', 'delete', 'sel-bar__danger'));
    actions.appendChild(btn('Clear', 'clear'));
    bar.appendChild(actions);
    root.setAttribute('data-selecting', '');
  }

  const rawBase = () => (document.body.dataset.rawBase || '').replace(/\/+$/, '');
  const cdnBase = () => { const h = $('.breadcrumb-container'); return ((h && h.getAttribute('data-cdn-base')) || location.origin).replace(/\/+$/, ''); };
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

  async function act(action) {
    const items = Array.from(sel, ([path, v]) => ({ path, type: v.type }));
    if (action === 'clear') return clear();
    if (action === 'all') {
      $$('#file-list .list-item').forEach((row) => { if (row.offsetParent !== null) setSelected(row, true); });
      return;
    }
    if (action === 'copy') {
      const lines = items.map((i) => (i.type === 'file' && rawBase() ? rawBase() : cdnBase()) + '/' + enc(i.path));
      toast((await copyText(lines.join('\n'))) ? (items.length === 1 ? 'Link copied' : items.length + ' links copied') : 'Could not copy', null);
      return;
    }
    if (action === 'download') {
      items.forEach((i, n) => setTimeout(() => {
        const a = document.createElement('a');
        a.href = (i.type === 'folder' ? '/api/pack/' : '/api/get/') + enc(i.path);
        a.setAttribute('download', ''); a.setAttribute('data-turbo', 'false'); a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
      }, n * 400));
      if (items.length > 1) toast('Starting ' + items.length + ' downloads. Your browser may ask to allow them.');
      return;
    }
    if (action === 'delete') return del(items);
  }

  async function del(items) {
    const files = items.filter((i) => i.type === 'file' && i.path.includes('/'));
    const skipped = items.length - files.length;
    if (!files.length) { toast('Only files inside a folder can be deleted here.', 'error'); return; }
    const names = files.slice(0, 5).map((i) => i.path).join('\n') + (files.length > 5 ? '\n…and ' + (files.length - 5) + ' more' : '');
    if (!window.confirm('Delete ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ' permanently?\n\n' + names + (skipped ? '\n\n(' + skipped + ' selected folder/root item(s) will be skipped.)' : ''))) return;
    let done = 0;
    for (const f of files) {
      let r;
      try {
        r = await fetch('/api/admin/delete', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken() }, body: JSON.stringify({ path: f.path }) });
      } catch (e) { toast('Network error while deleting.', 'error'); break; }
      if (r.status === 401 || r.status === 429) {
        try { sessionStorage.removeItem('t'); } catch (e) { /* ignore */ }
        toast('Admin login expired. Sign in again at /admin.', 'error'); renderBar(); break;
      }
      if (!r.ok) { toast('Could not delete ' + f.path.split('/').pop() + ' (' + r.status + ').', 'error'); break; }
      const v = sel.get(f.path);
      if (v) { v.row.remove(); sel.delete(f.path); }
      done++;
    }
    if (done) { toast('Deleted ' + done + ' file' + (done === 1 ? '' : 's')); if (window.__cdnFast) window.__cdnFast.refresh(true); }
    renderBar();
  }

  // --- events --------------------------------------------------------------------------------------
  // capture on window: run before Turbo / fasttree see the click, so a click on a row while selecting toggles it.
  window.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const a = t.closest('[data-sel-action]');
    if (a) { e.preventDefault(); act(a.dataset.selAction); return; }
    const row = t.closest('#file-list .list-item');
    if (!row || !onListing()) return;
    if (t.closest('.sel-box')) { setSelected(row, t.checked !== undefined ? t.checked : !row.classList.contains('is-selected')); return; }
    if (sel.size && !t.closest('.download-icon')) {
      const info = rowInfo(row);
      if (info) { e.preventDefault(); e.stopPropagation(); setSelected(row, !sel.has(info.path)); }
    }
  }, true);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sel.size) clear(); });
  document.addEventListener('turbo:load', () => { clear(true); decorate(); });
  document.addEventListener('turbo:render', decorate);
  document.addEventListener('turbo:before-cache', () => { clear(true); removeBar(); $$('.sel-box').forEach((b) => b.remove()); });
  // sorting / searching reorder or hide rows in place; make sure every row still has its checkbox
  const mo = new MutationObserver(() => { if (onListing() && $$('#file-list .list-item').some((r) => !$('.sel-box', r) && rowInfo(r))) decorate(); });
  function watch() { const l = $('#file-list'); if (l) mo.observe(l, { childList: true, subtree: true }); }
  document.addEventListener('turbo:load', watch);

  // --- floating upload button: hide while scrolling down, back on scroll up -----------------------
  let lastY = window.scrollY, ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY, dy = y - lastY;
      if (Math.abs(dy) > 8) { if (dy > 0 && y > 80) root.setAttribute('data-fab-hidden', ''); else root.removeAttribute('data-fab-hidden'); lastY = y; }
      ticking = false;
    });
  }, { passive: true });

  const start = () => { decorate(); watch(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
