// Test harness: build folder pages the way the browser does (app/static/fasttree.js), from the saved
// /api/tree and /api/shell responses. Usage: node tests/compose.js tree.json shell.json path1 path2 ...
// Prints {"<path>": "<html>"} as JSON (null for a folder the tree doesn't have).
const fs = require('node:fs');
const { buildIndex, compose } = require('../app/static/fasttree.js');

const [treeFile, shellFile, ...paths] = process.argv.slice(2);
const tree = JSON.parse(fs.readFileSync(treeFile, 'utf8'));
const shell = JSON.parse(fs.readFileSync(shellFile, 'utf8'));
const index = buildIndex(tree.files);
const out = {};
for (const p of paths) out[p] = compose(shell, index, p);
process.stdout.write(JSON.stringify(out));
