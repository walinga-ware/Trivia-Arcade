#!/usr/bin/env node
/*
 * check-data.js
 *
 * Pre-deploy sanity check for this quiz app. It re-does exactly what
 * index.html does at runtime (fetch each JSON file, merge into one
 * QUIZ_DATA object) and then checks that every constant app-init.js
 * destructures out of QUIZ_DATA actually exists.
 *
 * This catches, before you ever open a browser:
 *   1. A JSON filename referenced in index.html that doesn't exist on disk
 *      (typo, renamed file, forgot to commit it).
 *   2. A destructured constant name in app-init.js that doesn't match any
 *      key across the JSON files (renamed a key in the JSON but forgot to
 *      update app-init.js, or vice versa).
 *
 * Usage:
 *   node check-data.js
 * Exits non-zero (and prints what's wrong) if anything is missing.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const INDEX_HTML = path.join(ROOT, 'index.html');
const APP_INIT = path.join(ROOT, 'app-init.js');

function fail(msg) {
  console.error(`\n\u274c  ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`\u2705  ${msg}`);
}

// 1. Find every fetch('something.json') call in index.html.
const indexSrc = fs.readFileSync(INDEX_HTML, 'utf8');
const jsonFiles = [...indexSrc.matchAll(/fetch\(['"]([^'"]+\.json)['"]\)/g)].map(m => m[1]);

if (jsonFiles.length === 0) {
  fail(`No fetch('*.json') calls found in ${path.basename(INDEX_HTML)} — did the loading code change shape?`);
  process.exit(1);
}
ok(`Found ${jsonFiles.length} JSON file(s) referenced in index.html: ${jsonFiles.join(', ')}`);

// 2. Make sure each referenced file actually exists and is valid JSON,
//    then merge them the same way index.html does (spread in order).
let merged = {};
let hadFileError = false;

for (const file of jsonFiles) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) {
    fail(`index.html references '${file}' but no such file exists at ${fullPath}`);
    hadFileError = true;
    continue;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (e) {
    fail(`'${file}' exists but isn't valid JSON: ${e.message}`);
    hadFileError = true;
    continue;
  }
  const overlapping = Object.keys(parsed).filter(k => k in merged);
  if (overlapping.length > 0) {
    fail(`'${file}' defines key(s) [${overlapping.join(', ')}] that another JSON file already defined — one will silently overwrite the other.`);
  }
  merged = { ...merged, ...parsed };
}

if (hadFileError) {
  console.error('\nStopping: fix the file errors above before checking constant names.\n');
  process.exit(1);
}

ok(`All ${jsonFiles.length} JSON files exist and parse correctly (${Object.keys(merged).length} total keys).`);

// 3. Find the `const { A, B, C, ... } = QUIZ_DATA;` block in app-init.js
//    and check every name against the merged JSON keys.
const appInitSrc = fs.readFileSync(APP_INIT, 'utf8');
const destructureMatch = appInitSrc.match(/const\s*\{([\s\S]*?)\}\s*=\s*QUIZ_DATA\s*;/);

if (!destructureMatch) {
  fail(`Couldn't find a "const { ... } = QUIZ_DATA;" block in ${path.basename(APP_INIT)} — did the wiring code change shape?`);
  process.exit(1);
}

const destructuredNames = destructureMatch[1]
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

ok(`Found ${destructuredNames.length} constant(s) destructured from QUIZ_DATA in app-init.js.`);

const missing = destructuredNames.filter(name => !(name in merged));

if (missing.length > 0) {
  fail(`app-init.js expects these keys from QUIZ_DATA but none of the JSON files define them:\n   - ${missing.join('\n   - ')}`);
} else {
  ok('Every constant app-init.js expects is present in the merged JSON data.');
}

// 4. Flag JSON keys nobody actually uses (not a hard error, just a heads-up
//    for dead data / accidental duplicate key names).
const unused = Object.keys(merged).filter(k => !destructuredNames.includes(k));
if (unused.length > 0) {
  console.log(`\n\u2139\ufe0f  Note: these JSON keys aren't destructured anywhere in app-init.js (may be unused, or consumed some other way): ${unused.join(', ')}`);
}

if (process.exitCode) {
  console.error('\nCheck FAILED — see errors above.\n');
} else {
  console.log('\nAll checks passed.\n');
}
