/*!
 * amit/cdn UI behaviour — loaded once per full page load (head, deferred) on every page.
 *
 * Design rules that keep this safe with Turbo and the instant-folder renderer:
 *   - Everything is DELEGATED from `document`. Turbo swaps <body> on every visit, and cached snapshots lose
 *     element-level listeners, so nothing is bound to individual elements.
 *   - Page set-up lives in init(), which is idempotent and runs on DOMContentLoaded and every turbo:load.
 *   - Page markup is built with textContent / escaped strings, never by concatenating raw names into HTML.
 *
 * Sections: helpers · theme · header/menus · copy · listing (filter, sort, zip, truncation) · upload ·
 *           history · search · file preview · lifecycle
 */
(function () {
  'use strict';
  if (window.__cdnApp) return;
  window.__cdnApp = true;

  // ---------------------------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------------------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
    json(key) { try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
  };

  function formatBytes(n) {
    if (!n || n < 0) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }

  const ICON = {
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    file: '<svg class="file-icon-list" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',
    folder: '<svg class="folder-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>',
  };

  function toast(message, opts) {
    const o = opts || {};
    const region = $('#toasts');
    if (!region) return;
    const el = document.createElement('div');
    el.className = 'toast' + (o.type ? ' toast--' + o.type : '');
    el.innerHTML = (o.type === 'error' ? ICON.alert : ICON.check) + '<span></span>';
    el.lastChild.textContent = message;
    region.appendChild(el);
    while (region.children.length > 3) region.removeChild(region.firstChild);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 200);
    }, o.ms || 2200);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through to the legacy path */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  function flashButton(btn, label) {
    if (!btn) return;
    const span = btn.querySelector('span');
    const prev = span ? span.textContent : null;
    btn.classList.add('is-done');
    if (span && label) span.textContent = label;
    clearTimeout(btn._flash);
    btn._flash = setTimeout(() => {
      btn.classList.remove('is-done');
      if (span && prev != null) span.textContent = prev;
    }, 1400);
  }

  function openDialog(id) {
    const d = document.getElementById(id);
    if (!d) return null;
    if (typeof d.showModal === 'function') { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
    return d;
  }
  function closeDialog(d) {
    if (!d) return;
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
  }

  window.CDN = { toast, copyText, formatBytes, esc };

  // ---------------------------------------------------------------------------------------------
  // theme (the initial value is applied by an inline script in <head>; this owns changes)
  // ---------------------------------------------------------------------------------------------
  function syncThemeColor() {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (!bg) return;
    $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  }
  function setTheme(t, persist) {
    document.documentElement.setAttribute('data-theme', t);
    if (persist) store.set('cdn_theme', t);
    syncThemeColor();
  }
  try {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onSystem = (e) => { if (!store.get('cdn_theme')) setTheme(e.matches ? 'dark' : 'light', false); };
    if (mq.addEventListener) mq.addEventListener('change', onSystem); else if (mq.addListener) mq.addListener(onSystem);
  } catch (e) { /* matchMedia unavailable */ }

  // ---------------------------------------------------------------------------------------------
  // header, menus, copy, dialogs: one delegated click handler
  // ---------------------------------------------------------------------------------------------
  function closeMenus(except) {
    $$('.more.is-open').forEach((m) => {
      if (m === except) return;
      m.classList.remove('is-open');
      const b = $('.more__toggle', m); if (b) b.setAttribute('aria-expanded', 'false');
    });
    $$('.breadcrumb-menu.open').forEach((m) => {
      if (except && except.contains(m)) return;
      m.classList.remove('open');
      const b = m.parentElement && $('.breadcrumb-ellipsis', m.parentElement); if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;

    const act = t.closest('[data-action]');
    const action = act && act.getAttribute('data-action');

    if (action === 'theme-toggle') {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
      return;
    }
    if (action === 'nav-toggle') {
      const nav = $('#primary-nav');
      const open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      act.setAttribute('aria-expanded', String(open));
      return;
    }
    if (action === 'more-toggle') {
      const more = act.closest('.more');
      const open = !more.classList.contains('is-open');
      closeMenus(open ? more : null);
      more.classList.toggle('is-open', open);
      act.setAttribute('aria-expanded', String(open));
      return;
    }
    if (action === 'crumb-menu') {
      const wrap = act.closest('.breadcrumb-collapsed');
      const menu = wrap && $('.breadcrumb-menu', wrap);
      if (!menu) return;
      const open = !menu.classList.contains('open');
      closeMenus(open ? wrap : null);
      menu.classList.toggle('open', open);
      act.setAttribute('aria-expanded', String(open));
      return;
    }
    if (action === 'copy-path') {
      const holder = act.closest('.breadcrumb-container');
      const base = (holder && holder.getAttribute('data-cdn-base')) || location.origin;
      const ok = await copyText(base.replace(/\/$/, '') + location.pathname);
      toast(ok ? 'Link copied' : 'Could not copy', ok ? {} : { type: 'error' });
      return;
    }
    if (action === 'dialog-close') {
      closeDialog(act.closest('dialog'));
      // an <a data-action="dialog-close"> still follows its href (the zip download)
      return;
    }
    if (action === 'dismiss-notice') {
      store.set('cdn_notice_off_v1', '1');
      document.documentElement.setAttribute('data-notice', 'off');
      return;
    }
    if (action === 'clear-history') {
      store.del(act.getAttribute('data-key'));
      renderHistory();
      toast('History cleared');
      return;
    }

    // copy buttons: data-copy="text", data-copy-url="page"
    const copyBtn = t.closest('[data-copy], [data-copy-url]');
    if (copyBtn) {
      const text = copyBtn.hasAttribute('data-copy') ? copyBtn.getAttribute('data-copy') : location.href;
      const ok = await copyText(text);
      if (ok) { flashButton(copyBtn, 'Copied'); toast('Copied to clipboard'); } else toast('Could not copy', { type: 'error' });
      return;
    }

    // click on a dialog's backdrop closes it
    if (t.tagName === 'DIALOG') { closeDialog(t); return; }

    // click elsewhere closes open menus
    if (!t.closest('.more') && !t.closest('.breadcrumb-collapsed')) closeMenus(null);

    // listing / batch
    if (t.closest('#filter-clear')) {
      const input = $('#filter-input');
      if (input) { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); }
      return;
    }
    if (t.closest('#search-clear')) { clearSearch(); return; }
    if (t.closest('#url-clear')) { clearShortener(); return; }
    if (t.closest('#shorten-btn')) { shorten(); return; }
    const zipBtn = t.closest('#download-zip-btn');
    if (zipBtn) { e.preventDefault(); onZip(zipBtn); return; }

    // upload
    const folderBtn = t.closest('#folder-picker [data-folder]');
    if (folderBtn) {
      $$('#folder-picker [data-folder]').forEach((b) => {
        const on = b === folderBtn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      return;
    }
    if (t.closest('#url-upload-btn')) { uploadFromUrl(); return; }

    // history tabs
    const tab = t.closest('[data-history-tab]');
    if (tab) { switchTab(Number(tab.getAttribute('data-history-tab')), false); return; }
  });

  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.hasAttribute('data-select-on-focus')) t.select();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenus(null);
      const nav = $('#primary-nav'), tgl = $('.nav-toggle');
      if (nav && nav.classList.contains('is-open')) { nav.classList.remove('is-open'); if (tgl) { tgl.setAttribute('aria-expanded', 'false'); tgl.focus(); } }
      return;
    }
    // history tabs: arrow keys move between tabs
    const tabEl = e.target instanceof Element && e.target.closest('[role="tab"]');
    if (tabEl && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End')) {
      const tabs = $$('[role="tab"]', tabEl.parentElement);
      let i = tabs.indexOf(tabEl);
      if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') i = 0; else i = tabs.length - 1;
      e.preventDefault();
      switchTab(i, true);
      return;
    }
    // "/" focuses the page's main search/filter/url box
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const target = $('#filter-input') || $('#search-input') || $('#url-input');
      if (target) { e.preventDefault(); target.focus(); }
    }
  });

  // ---------------------------------------------------------------------------------------------
  // listing: filter, sort, zip, long-name truncation
  // ---------------------------------------------------------------------------------------------
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.id === 'filter-input') {
      const term = t.value.toLowerCase();
      const group = $('#filter-group');
      if (group) { if (t.value.length) group.setAttribute('data-has-text', 'true'); else group.removeAttribute('data-has-text'); }
      $$('#file-list .list-item[data-name]').forEach((item) => {
        const name = item.getAttribute('data-name').toLowerCase();
        if (name === '..') return;
        item.hidden = !name.includes(term);
      });
      scheduleTruncate();
    } else if (t.id === 'search-input') {
      onSearchInput(t);
    } else if (t.id === 'url-input') {
      const g = $('#shorten-group');
      if (g) { if (t.value.length) g.setAttribute('data-has-text', 'true'); else g.removeAttribute('data-has-text'); }
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t instanceof HTMLSelectElement && t.id === 'sort-select') {
      store.set('cdn_sort_v1', t.value);
      applySort();
    } else if (t instanceof HTMLInputElement && t.id === 'file-input') {
      if (t.files && t.files.length) handleFiles(t.files);
    }
  });

  const SIZE_UNITS = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };
  function rowBytes(row) {
    const el = $('.size-label', row);
    const m = el && /([\d.]+)\s*(B|KB|MB|GB|TB)/i.exec(el.textContent);
    return m ? parseFloat(m[1]) * SIZE_UNITS[m[2].toUpperCase()] : -1;
  }
  function applySort() {
    const list = $('#file-list');
    const select = $('#sort-select');
    if (!list || !select) return;
    const rows = Array.from(list.children).filter((r) => r.classList.contains('list-item'));
    if (!rows.length) return;
    // Folders have no size, so a folder with only sub-folders has nothing to size-sort. Disable those options
    // there, show "Default order" instead of a stale saved choice (without overwriting it), and hide the control
    // entirely when there is nothing to reorder.
    const hasSizes = rows.some((r) => rowBytes(r) >= 0);
    $$('option', select).forEach((o) => { if (o.value.indexOf('size') === 0) o.disabled = !hasSizes; });
    let mode = store.get('cdn_sort_v1', 'default');
    if (!hasSizes && mode.indexOf('size') === 0) mode = 'default';
    select.value = $$('option', select).some((o) => o.value === mode && !o.disabled) ? mode : 'default';
    const wrap = select.closest('.select-wrap');
    if (wrap) wrap.hidden = rows.filter((r) => r.getAttribute('data-name') !== '..').length < 2;
    rows.forEach((r, i) => { if (!r.dataset.i) r.dataset.i = String(i); });
    const isUp = (r) => r.getAttribute('data-name') === '..';
    const isDir = (r) => !!$('.folder-link', r) && !$('.size-label', r);
    const byName = (a, b) => a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'), undefined, { numeric: true, sensitivity: 'base' });
    const cmp = {
      'default': (a, b) => Number(a.dataset.i) - Number(b.dataset.i),
      'name': byName,
      'name-desc': (a, b) => byName(b, a),
      'size-desc': (a, b) => rowBytes(b) - rowBytes(a) || byName(a, b),
      'size-asc': (a, b) => rowBytes(a) - rowBytes(b) || byName(a, b),
    }[select.value] || byName;
    rows.sort((a, b) => (isUp(b) - isUp(a)) || (isDir(b) - isDir(a)) || cmp(a, b));
    const frag = document.createDocumentFragment();
    rows.forEach((r) => frag.appendChild(r));
    list.insertBefore(frag, list.firstChild);
  }

  async function onZip(btn) {
    if (btn.disabled) return;
    const batchId = btn.getAttribute('data-batch-id');
    const path = btn.getAttribute('data-path') || '';
    const statsUrl = batchId ? '/api/pack-info-batch/' + batchId : '/api/pack-info/' + path;
    const downloadUrl = batchId ? '/api/pack-batch/' + batchId : '/api/pack/' + path;
    const spinner = $('#zip-spinner');
    const label = $('#zip-btn-text');
    const labelHtml = label ? label.innerHTML : '';
    btn.disabled = true;
    if (spinner) spinner.style.display = 'block';
    if (label) label.textContent = 'Calculating…';
    try {
      const res = await fetch(statsUrl);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to get file stats');
      const what = batchId ? 'this batch' : (path ? path.split('/').pop() : 'root');
      $('#zip-dialog-text').innerHTML =
        'Download <strong>' + esc(what) + '</strong> as a single .zip? It packages <strong>' + esc(data.file_count) +
        ' file(s)</strong> totalling <strong>' + esc(data.size_str) + '</strong>.';
      $('#zip-dialog-confirm').href = downloadUrl;
      openDialog('zip-dialog');
    } catch (err) {
      showErrorDialog(err.message);
    } finally {
      btn.disabled = false;
      if (spinner) spinner.style.display = 'none';
      if (label) label.innerHTML = labelHtml;
    }
  }
  function showErrorDialog(message) {
    const text = $('#error-dialog-text');
    if (text && openDialog('error-dialog')) text.textContent = message; else toast(message, { type: 'error' });
  }

  // Phones: keep the extension visible by truncating the middle of long names (CSS can only cut the end).
  const MOBILE_BP = 480;
  let measureCanvas = null;
  function textWidth(text, font) {
    if (!measureCanvas) measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    ctx.font = font;
    return ctx.measureText(text).width;
  }
  function middleTruncate(full, maxWidth, font) {
    if (textWidth(full, font) <= maxWidth) return full;
    const dot = full.lastIndexOf('.');
    const hasExt = dot > 0 && dot < full.length - 1;
    const ext = hasExt ? full.slice(dot) : '';
    const base = hasExt ? full.slice(0, dot) : full;
    for (let head = base.length; head > 1; head--) {
      const cand = base.slice(0, head) + '...' + ext;
      if (textWidth(cand, font) <= maxWidth) return cand;
    }
    for (let end = full.length; end > 1; end--) {
      const cand = full.slice(0, end) + '...';
      if (textWidth(cand, font) <= maxWidth) return cand;
    }
    return full.slice(0, 1) + '...';
  }
  function applyTruncation() {
    const names = $$('.item-name');
    if (!names.length) return;
    const mobile = window.innerWidth <= MOBILE_BP;
    names.forEach((box) => {
      const a = box.querySelector('a[data-full-name]');
      const full = a && a.getAttribute('data-full-name');
      if (!a || !full) return;
      if (!mobile) { if (a.textContent !== full) a.textContent = full; return; }
      const width = box.clientWidth;
      if (!width) return;
      const icon = box.querySelector('svg');
      const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
      const avail = width - (icon ? icon.getBoundingClientRect().width : 0) - gap - 4;
      if (avail <= 0) return;
      const cs = getComputedStyle(a);
      const out = middleTruncate(full, avail, cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily);
      if (a.textContent !== out) a.textContent = out;
      if (!a.title) a.title = full;
    });
  }
  let truncRaf = 0;
  function scheduleTruncate() {
    cancelAnimationFrame(truncRaf);
    truncRaf = requestAnimationFrame(() => requestAnimationFrame(applyTruncation));
  }
  window.scheduleTruncate = scheduleTruncate;

  function applyPlaceholders() {
    const mobile = window.innerWidth <= MOBILE_BP;
    const f = $('#filter-input'); if (f) f.placeholder = mobile ? 'Search this folder...' : 'Search this folder... (press / to focus)';
    const s = $('#search-input'); if (s) s.placeholder = mobile ? 'Find files...' : 'Find a file anywhere in the CDN...';
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { scheduleTruncate(); applyPlaceholders(); }, 120);
  });

  // ---------------------------------------------------------------------------------------------
  // upload
  // ---------------------------------------------------------------------------------------------
  const MAX_FILE_BYTES = 200 * 1024 * 1024;

  function recordUpload(item) {
    try {
      const entries = store.json('cdn_uploads_v1');
      entries.unshift({ filename: item.filename, hf_path: item.hf_path, size: item.size, cdn_url: item.cdn_url, raw_url: item.raw_url, ts: Date.now() });
      store.set('cdn_uploads_v1', JSON.stringify(entries.slice(0, 50)));
    } catch (e) { /* ignore */ }
    // a new file exists now: refresh the cached tree so instant folder navigation shows it
    if (window.__cdnFast) window.__cdnFast.refresh(true);
  }
  const selectedFolder = () => { const a = $('#folder-picker .is-active'); return a ? a.getAttribute('data-folder') : 'uploads'; };
  function uploadError(msg) { const box = $('#error-box'); if (!box) return; box.textContent = msg; box.hidden = false; }
  function clearUploadError() { const box = $('#error-box'); if (box) { box.hidden = true; box.textContent = ''; } }

  function queueItem(name) {
    const li = document.createElement('li');
    li.className = 'queue-item';
    li.innerHTML = '<span class="queue-item__name"></span><span class="queue-item__status"></span><div class="queue-item__bar"><i></i></div>';
    li.firstChild.textContent = name;
    li.setAttribute('title', name);
    $('#results').prepend(li);
    return li;
  }
  function setStatus(li, html) { $('.queue-item__status', li).innerHTML = html; }
  function markDone(li, item) {
    li.className = 'queue-item is-done';
    li.innerHTML = '<span class="queue-item__name"></span><span class="queue-item__actions"><a href="/' + esc(item.hf_path) + '">View</a>' +
      '<a href="#" data-copy="' + esc(item.cdn_url || (location.origin + '/' + item.hf_path)) + '">Copy link</a></span>';
    li.firstChild.textContent = item.filename;
    const copy = $('[data-copy]', li);
    copy.addEventListener('click', (ev) => ev.preventDefault());
  }
  function markFailed(li, msg) {
    li.className = 'queue-item is-error';
    $('.queue-item__bar', li) && $('.queue-item__bar', li).remove();
    setStatus(li, ICON.alert + '<span>' + esc(msg || 'Failed') + '</span>');
  }

  function handleFiles(fileList) {
    clearUploadError();
    const all = Array.from(fileList);
    const files = all.filter((f) => f.size <= MAX_FILE_BYTES);
    const rejected = all.filter((f) => f.size > MAX_FILE_BYTES).map((f) => f.name);
    if (rejected.length) uploadError('Skipped ' + rejected.length + ' file(s) over ' + formatBytes(MAX_FILE_BYTES) + ': ' + rejected.join(', '));
    if (!files.length) return;

    const rows = new Map();
    files.forEach((f) => {
      const li = queueItem(f.name);
      setStatus(li, formatBytes(f.size) + ' · waiting…');
      rows.set(f.name, li);
    });

    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    form.append('folder', selectedFolder());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/put', true);
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      rows.forEach((li) => {
        if (pct >= 100) { li.classList.add('is-saving'); setStatus(li, '<span class="spinner"></span><span>saving…</span>'); } else {
          setStatus(li, pct + '%');
          const bar = $('.queue-item__bar i', li); if (bar) bar.style.width = pct + '%';
        }
      });
    };
    xhr.onload = () => {
      const fileInput = $('#file-input'); if (fileInput) fileInput.value = '';
      if (xhr.status >= 200 && xhr.status < 300) {
        let data;
        try { data = JSON.parse(xhr.responseText); } catch (e) { uploadError('Invalid response from server.'); return; }
        const rowList = Array.from(rows.values());
        (data.files || []).forEach((item, idx) => {
          recordUpload(item);
          // match by name; if the server renamed the file, fall back to upload order so no row hangs on "waiting"
          const li = rows.get(item.filename) || rowList[idx];
          if (li) markDone(li, item);
        });
        if (data.batch_url) {
          const li = document.createElement('li');
          li.className = 'queue-item queue-item--group is-done';
          li.innerHTML = '<span class="queue-item__status">All ' + esc((data.files || []).length) + ' files uploaded. Group link:</span>' +
            '<a href="' + esc(data.batch_url) + '" target="_blank" rel="noopener">' + esc(data.batch_url) + '</a>';
          $('#results').prepend(li);
        }
        toast(files.length === 1 ? 'Upload complete' : files.length + ' files uploaded');
      } else {
        let msg = 'Upload failed.';
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch (e) { /* keep default */ }
        uploadError(msg);
        rows.forEach((li) => markFailed(li, 'Failed'));
      }
    };
    xhr.onerror = () => { uploadError('Connection error.'); rows.forEach((li) => markFailed(li, 'Failed')); };
    xhr.send(form);
  }

  async function uploadFromUrl() {
    const input = $('#url-input');
    const btn = $('#url-upload-btn');
    if (!input || !btn) return;
    const url = input.value.trim();
    clearUploadError();
    if (!url) return;
    let label;
    try { label = decodeURIComponent(new URL(url).pathname.split('/').pop()) || url; } catch (e) { uploadError("That doesn't look like a valid URL."); return; }
    const li = queueItem(label);
    setStatus(li, '<span class="spinner"></span><span>fetching &amp; saving…</span>');
    li.classList.add('is-saving');
    btn.disabled = true;
    try {
      const resp = await fetch('/api/put-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, folder: selectedFolder() }) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || 'Upload from URL failed.');
      const item = data.files[0];
      recordUpload(item);
      markDone(li, item);
      input.value = '';
      toast('Upload complete');
    } catch (err) {
      markFailed(li, 'Failed');
      uploadError(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // drag & drop (delegated: the page can be swapped by Turbo at any time)
  document.addEventListener('dragover', (e) => { const z = e.target instanceof Element && e.target.closest('#dropzone'); if (z) { e.preventDefault(); z.classList.add('dragover'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target instanceof Element && e.target.closest('#dropzone'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('dragover'); });
  document.addEventListener('drop', (e) => {
    const z = e.target instanceof Element && e.target.closest('#dropzone');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  document.addEventListener('paste', (e) => {
    if (document.body.dataset.page !== 'upload') return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { e.preventDefault(); handleFiles(files); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.id === 'url-input') {
      const page = document.body.dataset.page;
      if (page === 'upload') { e.preventDefault(); uploadFromUrl(); } else if (page === 'shorten') { e.preventDefault(); shorten(); }
    }
  });

  // ---------------------------------------------------------------------------------------------
  // url shortener
  // ---------------------------------------------------------------------------------------------
  const PRIVATE_HOST_RE = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|\[?::1\]?|.*\.localhost|.*\.local|.*\.lan)$/i;
  function isPrivateHost(raw) { try { return PRIVATE_HOST_RE.test(new URL(raw).hostname); } catch (e) { return false; } }
  function shortenError(msg) { const b = $('#error-box'); if (!b) return; b.textContent = msg; b.style.display = msg ? 'block' : 'none'; }
  function clearShortener() {
    const input = $('#url-input'); const group = $('#shorten-group'); const result = $('#result');
    if (input) { input.value = ''; input.focus(); }
    if (group) group.removeAttribute('data-has-text');
    shortenError('');
    if (result) result.hidden = true;
  }
  async function shorten() {
    const input = $('#url-input'); const btn = $('#shorten-btn'); const result = $('#result');
    if (!input || !btn || btn.disabled) return;
    const url = input.value.trim();
    shortenError('');
    if (result) result.hidden = true;
    if (!url) { shortenError('Please enter a URL.'); return; }
    if (!/^https:\/\//i.test(url)) { shortenError('Only https:// URLs are supported.'); return; }
    if (isPrivateHost(url)) { shortenError('Localhost and private network URLs cannot be shortened.'); return; }
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      const res = await fetch('/api/shorten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to shorten URL.');
      const link = $('#masked-link');
      link.href = '/mask/' + data.id;
      link.textContent = data.masked_url;
      $('#copy-btn').setAttribute('data-copy', data.masked_url);
      result.hidden = false;
    } catch (err) {
      shortenError(err.message || 'An unexpected error occurred.');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // history
  // ---------------------------------------------------------------------------------------------
  function relTime(ts) {
    if (!ts) return '';
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    if (mins < 1440) return Math.round(mins / 60) + 'h ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function historyRow(opts) {
    const dl = opts.download
      ? '<a href="/api/get/' + esc(opts.download) + '" class="download-icon" title="Download" aria-label="Download ' + esc(opts.name) + '" data-turbo="false">' + ICON.download + '</a>' : '';
    return '<div class="list-item" data-name="' + esc(opts.name) + '"><div class="item-name">' + (opts.dir ? ICON.folder : ICON.file) +
      '<a href="' + esc(opts.href) + '" class="' + (opts.dir ? 'folder-link' : 'file-link') + '" data-full-name="' + esc(opts.name) + '">' + esc(opts.name) + '</a></div>' +
      '<div class="item-meta">' + (opts.size ? '<span class="size-label">' + esc(opts.size) + '</span>' : '') +
      '<span class="when">' + esc(relTime(opts.ts)) + '</span>' + dl + '</div></div>';
  }
  function renderHistory() {
    const up = $('#history-uploads-list');
    const vis = $('#history-visited-list');
    if (up) {
      const items = store.json('cdn_uploads_v1');
      up.innerHTML = items.length
        ? items.map((i) => historyRow({ name: i.filename || String(i.hf_path || '').split('/').pop(), href: '/' + i.hf_path, size: i.size ? formatBytes(i.size) : '', ts: i.ts, download: i.hf_path })).join('')
        : '<div class="empty-state"><p>No uploads logged yet on this browser.</p></div>';
    }
    if (vis) {
      const items = store.json('cdn_visited_v1');
      vis.innerHTML = items.length
        ? items.map((i) => {
            const dir = i.type === 'folder';
            const name = dir ? String(i.path).split('/').pop() + '/' : (i.filename || String(i.path).split('/').pop());
            return historyRow({ name, href: '/' + i.path, ts: i.ts, dir, download: dir ? '' : i.path });
          }).join('')
        : '<div class="empty-state"><p>No visited links logged yet.</p></div>';
    }
    scheduleTruncate();
  }
  function switchTab(index, focus) {
    const tabs = $$('[data-history-tab]');
    if (!tabs.length) return;
    tabs.forEach((t, i) => {
      const on = i === index;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
      if (on && focus) t.focus();
    });
  }

  // ---------------------------------------------------------------------------------------------
  // search
  // ---------------------------------------------------------------------------------------------
  let searchTimer = 0, searchCtl = null, searchSeq = 0;
  function searchStatus(html) {
    const el = $('#search-status');
    if (!el) return;
    el.hidden = !html;
    el.innerHTML = html || '';
  }
  function clearSearch() {
    const input = $('#search-input'); const group = $('#search-group'); const results = $('#search-results');
    if (input) { input.value = ''; input.focus(); }
    if (group) group.removeAttribute('data-has-text');
    if (results) results.innerHTML = '';
    searchStatus('');
  }
  function renderResults(items) {
    const box = $('#search-results');
    if (!box) return;
    if (!items.length) { box.innerHTML = ''; searchStatus('No matching files found. Try a different term.'); return; }
    searchStatus('<strong>' + items.length + '</strong> result' + (items.length !== 1 ? 's' : ''));
    box.innerHTML = items.map((it) => {
      const name = it.is_dir ? it.name + '/' : it.name;
      const dl = it.is_dir ? '' : '<a href="/api/get/' + esc(it.path) + '" class="download-icon" title="Download" aria-label="Download ' + esc(it.name) + '" data-turbo="false">' + ICON.download + '</a>';
      return '<div class="list-item list-item--stack" data-name="' + esc(it.name) + '"><div class="row-top"><div class="item-name">' + (it.is_dir ? ICON.folder : ICON.file) +
        '<a href="/' + esc(it.path) + '" class="' + (it.is_dir ? 'folder-link' : 'file-link') + '" data-full-name="' + esc(name) + '">' + esc(name) + '</a></div>' +
        '<div class="item-meta">' + (it.is_dir ? '' : '<span class="size-label">' + esc(it.size_str) + '</span>' + dl) + '</div></div>' +
        '<div class="result-path">' + esc(it.path) + '</div></div>';
    }).join('');
    scheduleTruncate();
  }
  function onSearchInput(input) {
    const term = input.value.trim();
    const group = $('#search-group');
    clearTimeout(searchTimer);
    if (group) { if (input.value.length) group.setAttribute('data-has-text', 'true'); else group.removeAttribute('data-has-text'); }
    if (!term) { const r = $('#search-results'); if (r) r.innerHTML = ''; searchStatus(''); return; }
    searchStatus('<span class="spinner"></span> Searching…');
    searchTimer = setTimeout(() => {
      const seq = ++searchSeq;
      if (searchCtl) searchCtl.abort();
      searchCtl = new AbortController();
      fetch('/api/find?q=' + encodeURIComponent(term), { signal: searchCtl.signal })
        .then((r) => r.json())
        .then((d) => { if (seq === searchSeq) renderResults(d.results || []); })
        .catch((err) => {
          if (err.name === 'AbortError' || seq !== searchSeq) return;
          const r = $('#search-results'); if (r) r.innerHTML = '';
          searchStatus('Search failed. Please try again.');
        });
    }, 300);
  }

  // ---------------------------------------------------------------------------------------------
  // file preview (text). Images, video, audio and PDF are plain elements rendered by the server.
  // ---------------------------------------------------------------------------------------------
  const PREVIEW_BYTES = 256 * 1024;
  const PREVIEW_LINES = 5000;

  async function loadTextPreview(box) {
    if (box.getAttribute('data-state') === 'done' || box.getAttribute('data-state') === 'loading') return;
    box.setAttribute('data-state', 'loading');
    const status = (msg) => { box.innerHTML = '<p class="preview__status"></p>'; box.firstChild.textContent = msg; box.classList.remove('is-skeleton'); box.setAttribute('aria-busy', 'false'); };
    try {
      const res = await fetch(box.getAttribute('data-text-src'));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const reader = res.body && res.body.getReader ? res.body.getReader() : null;
      let bytes, truncated = false;
      if (reader) {
        const chunks = []; let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); total += value.length;
          if (total >= PREVIEW_BYTES) { truncated = true; reader.cancel().catch(() => {}); break; }
        }
        bytes = new Uint8Array(Math.min(total, PREVIEW_BYTES));
        let off = 0;
        for (const c of chunks) { const part = c.subarray(0, Math.max(0, bytes.length - off)); bytes.set(part, off); off += part.length; if (off >= bytes.length) break; }
      } else {
        const buf = new Uint8Array(await res.arrayBuffer());
        truncated = buf.length > PREVIEW_BYTES;
        bytes = truncated ? buf.subarray(0, PREVIEW_BYTES) : buf;
      }
      const text = new TextDecoder('utf-8').decode(bytes);
      if (text.indexOf('\u0000') !== -1) { status("This file doesn't look like text, so there's no preview."); box.setAttribute('data-state', 'done'); return; }
      if (!text.trim()) { status('This file is empty.'); box.setAttribute('data-state', 'done'); return; }

      let lines = text.split(/\r?\n/);
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      if (lines.length > PREVIEW_LINES) { lines = lines.slice(0, PREVIEW_LINES); truncated = true; }
      // build with textContent so file contents can never become markup
      const pre = document.createElement('pre');
      pre.setAttribute('aria-label', 'File contents');
      const code = document.createElement('code');
      lines.forEach((l) => { const s = document.createElement('span'); s.className = 'ln'; s.textContent = l; code.appendChild(s); });
      pre.appendChild(code);
      const bar = document.createElement('div');
      bar.className = 'preview__bar';
      bar.innerHTML = '<span></span><button type="button" class="btn btn-sm" data-copy-preview aria-label="Copy file contents" title="Copy file contents">' + ICON.copy + '<span>Copy contents</span></button>';
      bar.firstChild.textContent = lines.length + ' line' + (lines.length !== 1 ? 's' : '') + (truncated ? ' · preview truncated' : '');
      // everything is built off-screen above, then swapped in at once (replacing the skeleton)
      box.replaceChildren(bar, pre);
      box.classList.remove('is-skeleton');
      box.classList.add('is-ready');
      box.setAttribute('aria-busy', 'false');
      box.setAttribute('data-state', 'done');
    } catch (err) {
      status("Couldn't load a preview. Use Open raw instead.");
      box.setAttribute('data-state', 'idle');
    }
  }
  document.addEventListener('click', async (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-copy-preview]');
    if (!b) return;
    const code = $('code', b.closest('.preview__text'));
    const text = code ? Array.from(code.children).map((s) => s.textContent).join('\n') : '';
    const ok = await copyText(text);
    if (ok) { flashButton(b, 'Copied'); toast('Contents copied'); } else toast('Could not copy', { type: 'error' });
  });
  // an image that fails to load (deleted upstream, blocked host) degrades to the plain no-preview state
  function imageFailed(box) {
    box.className = 'preview preview--none';
    box.innerHTML = '<div class="preview__none"><p>This image could not be loaded.</p></div>';
  }
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const box = img.closest('.preview--image');
    if (box) imageFailed(box);
  }, true);
  // images and PDFs sit behind a shimmer until they have loaded, then appear at once
  document.addEventListener('load', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLImageElement || t instanceof HTMLIFrameElement)) return;
    const box = t.closest('.preview.is-loading');
    if (box) box.classList.remove('is-loading');
  }, true);
  function settleLoadingPreviews() {
    $$('.preview.is-loading').forEach((box) => {
      const img = $('img', box);
      if (img && img.complete) { if (img.naturalWidth > 0) box.classList.remove('is-loading'); else imageFailed(box); return; }
      // never leave a skeleton up forever (e.g. a PDF viewer that doesn't fire load)
      setTimeout(() => box.classList.remove('is-loading'), 8000);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // lifecycle
  // ---------------------------------------------------------------------------------------------
  function init() {
    syncThemeColor();
    applyPlaceholders();
    applySort();
    scheduleTruncate();
    const page = document.body && document.body.dataset.page;
    // scrollable code blocks must be reachable by keyboard
    $$('pre, .link-row__code').forEach((el) => { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0'); });
    // folder pages have no visible heading (the breadcrumb is the title); give assistive tech one
    if (page === 'listing' && !$('main h1')) {
      const name = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
      const main = $('#main');
      if (name && main) { const h = document.createElement('h1'); h.className = 'sr-only'; h.textContent = name; main.insertBefore(h, main.firstChild); }
    }
    if (page === 'history') renderHistory();
    $$('.preview__text[data-text-src]').forEach(loadTextPreview);
    settleLoadingPreviews();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  document.addEventListener('turbo:load', () => {
    if (window.Turbo && window.Turbo.setProgressBarDelay && !window.__cdnProgress) { window.__cdnProgress = true; window.Turbo.setProgressBarDelay(0); }
    document.body.classList.remove('turbo-loading');
    init();
  });
  document.addEventListener('turbo:visit', () => document.body.classList.add('turbo-loading'));
  document.addEventListener('turbo:submit-start', () => document.body.classList.add('turbo-loading'));
  document.addEventListener('turbo:before-render', () => document.body.classList.remove('turbo-loading'));
  document.addEventListener('turbo:render', () => { document.body.classList.remove('turbo-loading'); init(); });
  document.addEventListener('turbo:before-cache', () => {
    // don't freeze open menus into the cached snapshot
    closeMenus(null);
    $$('.preview__text[data-state="loading"]').forEach((el) => el.setAttribute('data-state', 'idle'));
    const nav = $('#primary-nav'); if (nav) nav.classList.remove('is-open');
    const tgl = $('.nav-toggle'); if (tgl) tgl.setAttribute('aria-expanded', 'false');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/static/sw.js').catch((err) => console.error('service worker registration failed:', err));
    });
  }
})();
