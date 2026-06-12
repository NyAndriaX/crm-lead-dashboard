#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web");

const ALL = [
  "extractApiError",
  "notifyApiError",
  "notifyError",
  "notifyInfo",
  "notifySuccess",
  "notifyWarning",
  "showErrorPopup",
  "showSuccessPopup",
  "showWarningPopup",
  "showInfoPopup",
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, acc);
    } else if (/\.(tsx|ts)$/.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

function usedSymbols(content) {
  return ALL.filter((s) => new RegExp(`\\b${s}\\b`).test(content));
}

for (const file of walk(web)) {
  if (file.endsWith("lib/feedback.ts")) continue;
  let content = fs.readFileSync(file, "utf8");
  const uses = usedSymbols(content);
  if (uses.length === 0) continue;

  content = content.replace(/import\s*\{[^}]+\}\s*from\s*["']@\/lib\/feedback["'];?\n?/g, "");
  const importLine = `import { ${uses.join(", ")} } from "@/lib/feedback";\n`;

  const lines = content.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import .+ from ["']/.test(lines[i])) lastImport = i;
  }
  if (lastImport >= 0) lines.splice(lastImport + 1, 0, importLine.trim());
  else lines.unshift(importLine.trim());

  content = lines.join("\n");
  fs.writeFileSync(file, content);
}
console.log("Imports fixed.");
