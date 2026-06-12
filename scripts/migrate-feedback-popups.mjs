#!/usr/bin/env node
/**
 * Remplace message.success/error/warning/info (toast) par les popups Modal de lib/feedback.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "apps/web");

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, acc);
    } else if (/\.(tsx|ts)$/.test(name) && !p.endsWith("lib/feedback.ts")) {
      acc.push(p);
    }
  }
  return acc;
}

const FEEDBACK_IMPORT =
  'import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";';

function ensureFeedbackImport(content) {
  if (content.includes('from "@/lib/feedback"')) return content;
  const lines = content.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import .+ from ["']/.test(lines[i])) lastImport = i;
  }
  if (lastImport >= 0) {
    lines.splice(lastImport + 1, 0, FEEDBACK_IMPORT);
    return lines.join("\n");
  }
  return FEEDBACK_IMPORT + "\n" + content;
}

function removeMessageFromAntdImport(content) {
  return content.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']antd["'];?/g,
    (full, inner) => {
      const parts = inner
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && s !== "message");
      if (parts.length === 0) return "";
      return `import { ${parts.join(", ")} } from "antd";`;
    },
  );
}

function transform(content) {
  if (!/message\.(error|success|warning|info)\(/.test(content)) return null;

  let c = content;

  c = c.replace(/message\.success\(/g, "notifySuccess(");
  c = c.replace(/message\.warning\(/g, "notifyWarning(");
  c = c.replace(/message\.info\(/g, "notifyInfo(");

  // catch { notifyError / notifyApiError patterns — add (e) param
  c = c.replace(
    /catch\s*\{\s*notifyError\(/g,
    "catch (e) { notifyApiError(e, ",
  );
  c = c.replace(
    /catch\s*\{\s*notifyApiError\(/g,
    "catch (e) { notifyApiError(e, ",
  );

  // message.error( -> notifyError( for static; many catch blocks use notifyApiError via manual fix
  c = c.replace(/message\.error\(/g, "notifyError(");

  // catch (e) { const msg = ... notifyError(msg) -> notifyApiError
  c = c.replace(
    /catch\s*\((\w+)\)\s*\{\s*const msg = \(e as[^;]+;[\s\n]*if \(msg\) notifyError\(msg\);?\s*\}/g,
    "catch ($1) { notifyApiError($1, \"Une erreur est survenue\"); }",
  );

  c = ensureFeedbackImport(c);
  c = removeMessageFromAntdImport(c);
  c = c.replace(/\n{3,}/g, "\n\n");

  return c;
}

let changed = 0;
for (const file of walk(web)) {
  const raw = fs.readFileSync(file, "utf8");
  const next = transform(raw);
  if (next && next !== raw) {
    fs.writeFileSync(file, next);
    changed++;
    console.log("updated:", path.relative(root, file));
  }
}
console.log(`Done. ${changed} file(s) updated.`);
