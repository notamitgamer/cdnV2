// Run with: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, jsonForScript, formatSize, buildIndex, listFolder, compose, folderPathFromUrl } =
  require('../app/static/fasttree.js');

const FILES = [
  ['README.md', 1200], ['.gitattributes', 66],
  ['bsc/zeta.pdf', 2500000], ['bsc/Alpha.pdf', 999], ['bsc/sem1/n.txt', 12], ['bsc/sem1/deep/a.bin', 5],
  ['$&/<b>.txt', 7], ['@@name@@/x.txt', 1152],
];
const index = buildIndex(FILES);

test('buildIndex: folders, files, totals', () => {
  assert.deepEqual([...index.folders.keys()].sort(), ['', '$&', '@@name@@', 'bsc', 'bsc/sem1', 'bsc/sem1/deep']);
  assert.equal(index.count, 8);
  assert.equal(index.bytes, 1200 + 66 + 2500000 + 999 + 12 + 5 + 7 + 1152);
});

test('listFolder: folders first, then case-insensitive by name, with sizes', () => {
  const items = listFolder(index, 'bsc');
  assert.deepEqual(items.map((i) => [i.name, i.is_dir, i.size_str]), [
    ['sem1', true, '-'], ['Alpha.pdf', false, '999 B'], ['zeta.pdf', false, '2.38 MB'],
  ]);
  assert.equal(items[1].path, 'bsc/Alpha.pdf');
  assert.equal(listFolder(index, 'nope'), null);
});

test('formatSize: matches Python, including round-half-even ties', () => {
  const cases = { 0: '0 B', 1023: '1023 B', 1024: '1.00 KB', 1152: '1.12 KB', 1408: '1.38 KB', 1048576: '1.00 MB', 2500000: '2.38 MB' };
  for (const [n, want] of Object.entries(cases)) assert.equal(formatSize(Number(n)), want, n);
});

test('escapeHtml / jsonForScript', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&#34;x&#34;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(jsonForScript('a</script>&\'é'), '"a\\u003c/script\\u003e\\u0026\\u0027\\u00e9"');
});

test('folderPathFromUrl: plain content paths only', () => {
  const p = (s) => folderPathFromUrl(new URL(s, 'https://cdn.example.com'));
  assert.equal(p('/'), '');
  assert.equal(p('/bsc/'), 'bsc');
  assert.equal(p('/a%26b/it%27s%20here'), "a&b/it's here");
  assert.equal(p('/bsc?x=1'), null);
  assert.equal(p('/bsc#top'), null);
  for (const r of ['/api/get/x', '/admin', '/mask/abc', '/pack/b1', '/static/sw.js', '/raw/x']) assert.equal(p(r), null, r);
  assert.equal(p('/administrator'), 'administrator');   // only whole segments are reserved
  assert.equal(p('/%E0%A4%A'), null);                   // malformed escape
});

// A hand-made shell: every fragment is visible in the output, so substitution is easy to assert on.
const shell = {
  cdn_base: 'https://cdn.example.com',
  html: 'A<!--@root-header-->B<!--@breadcrumb-->C<!--@toolbar-->D<!--@list-->E<!--@stats-->F/*@visit*/G',
  parts: {
    root_header: '[RH]', count: '<c>@@n@@ @@word@@@@s@@</c>', toolbar: '[TB:@@counts@@|@@path@@]',
    go_up: '[UP:@@parent_path@@]', row_dir: '[D:@@name@@|@@path@@]', row_file: '[F:@@name@@|@@path@@|@@size_str@@]',
    empty: '[EMPTY]', stats: '[ST:@@n@@@@s@@|@@size_str@@]', crumb_container: '[CC:@@inner@@|@@tail@@]',
    crumb_link: '<@@href@@:@@name@@>', crumb_collapsed: '[COL:@@menu@@]', copy_btn: '[CP:@@path@@]',
    visit: 'V(@@path_json@@,@@cdn_url_json@@)',
  },
};
const norm = (s) => s.replace(/\s+/g, ' ');

test('compose: root has the header, no breadcrumb/go-up/visit; hidden .gitattributes is not a row or a count', () => {
  const html = norm(compose(shell, index, ''));
  assert.match(html, /^A\[RH\]BC\[TB: <c>3 folders<\/c> &amp; <c>1 file<\/c> \|\]D/);
  assert.ok(!html.includes('.gitattributes'));
  assert.ok(html.includes('[F:README.md|README.md|1.17 KB]'));
  assert.ok(!html.includes('[UP:'));
  assert.ok(html.endsWith('E[ST:8s|2.39 MB]FG'), html.slice(-40));
});

test('compose: a folder gets breadcrumb, go-up row, counts and a visit entry', () => {
  const html = norm(compose(shell, index, 'bsc/sem1'));
  assert.ok(html.includes('[CC: </:root> / </bsc:bsc> / </bsc/sem1:sem1> |[CP:bsc/sem1]]'), html);
  assert.ok(html.includes('[UP:/bsc]'));
  assert.ok(html.includes('<c>1 folder</c> &amp; <c>1 file</c>'));
  assert.ok(html.includes('V("bsc/sem1","https://cdn.example.com/bsc/sem1/")'));
  assert.ok(!html.includes('[RH]'));
});

test('compose: top-level folders go up to "/"', () => {
  assert.ok(norm(compose(shell, index, 'bsc')).includes('[UP:/]'));
});

test('compose: names are substituted literally (no $-patterns, no re-expansion of @@x@@)', () => {
  const html = norm(compose(shell, index, '$&'));
  assert.ok(html.includes('[F:&lt;b&gt;.txt|$&amp;/&lt;b&gt;.txt|7 B]'), html);
  const html2 = norm(compose(shell, index, '@@name@@'));
  assert.ok(html2.includes('[F:x.txt|@@name@@/x.txt|1.12 KB]'), html2);
});

test('compose: empty-looking folder shows the empty state and "0 items"', () => {
  const only = buildIndex([['solo/.gitattributes', 1]]);
  const html = norm(compose(shell, only, 'solo'));
  assert.ok(html.includes('0 items'));
  assert.ok(html.includes('[EMPTY]'));
});
