#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, acc);
    } else if (/\.(tsx|ts)$/.test(name)) acc.push(p);
  }
  return acc;
}

for (const file of walk(web)) {
  let c = fs.readFileSync(file, "utf8");
  const before = c;

  c = c.replace(
    /catch\s*\{\s*notifyError\(([^)]+)\);\s*\}/g,
    "catch (e) { notifyApiError(e, $1); }",
  );

  c = c.replace(
    /catch\s*\((\w+)\)\s*\{\s*notifyError\(\(\1 as \{ response\?: \{ data\?: \{ message\?: string \} \} \}\)\.response\?\.data\?\.message \?\? "([^"]+)"\);\s*\}/g,
    'catch ($1) { notifyApiError($1, "$2"); }',
  );

  c = c.replace(
    /catch\s*\((\w+)\)\s*\{\s*const msg = \(\1 as \{ response\?: \{ data\?: \{ message\?: string \} \} \}\)\.response\?\.data\?\.message(?:\s*\?\?\s*"([^"]+)")?;\s*notifyError\(msg(?:\s*\?\?\s*"([^"]+)")?\);\s*\}/g,
    'catch ($1) { notifyApiError($1, "$2$3"); }',
  );

  c = c.replace(
    /catch\s*\((\w+)\)\s*\{\s*const msg = \(\1 as \{ response\?: \{ data\?: \{ message\?: string \} \} \}\)\.response\?\.data\?\.message \?\? "([^"]+)";\s*notifyError\(msg\);\s*\}/g,
    'catch ($1) { notifyApiError($1, "$2"); }',
  );

  c = c.replace(
    /catch\s*\((\w+)\)\s*\{\s*notifyError\(\(\1 as \{ response\?: \{ data\?: \{ message\?: string \} \} \}\)\.response\?\.data\?\.message \?\? "([^"]+)"\);\s*\}/g,
    'catch ($1) { notifyApiError($1, "$2"); }',
  );

  c = c.replace(
    /notifyError\(\(e as \{ response\?: \{ data\?: \{ message\?: string \} \} \}\)\.response\?\.data\?\.message \?\? "([^"]+)"\)/g,
    'notifyApiError(e, "$1")',
  );

  if (c !== before) {
    fs.writeFileSync(file, c);
    console.log("fixed:", path.relative(root, file));
  }
}
