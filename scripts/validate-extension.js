const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "dist/browser-shield-plugin");
const allowBroad = process.env.ALLOW_BROAD_EXTENSION_PERMISSIONS === "true";
const errors = [];

function read(relative) {
  const file = path.join(extensionDir, relative);
  if (!fs.existsSync(file)) {
    errors.push(`${relative} is missing`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

const manifestText = read("manifest.json");
let manifest = {};
try {
  manifest = JSON.parse(manifestText || "{}");
} catch {
  errors.push("manifest.json is not valid JSON");
}

const serviceWorkerPath = manifest.background?.service_worker;
const serviceWorker = serviceWorkerPath ? read(serviceWorkerPath) : "";
if (!serviceWorkerPath) errors.push("background.service_worker is missing");
if (/\b(import|export)\b/.test(serviceWorker) && manifest.background?.type !== "module") {
  errors.push("service worker contains import/export but background.type is not module");
}

for (const script of manifest.content_scripts ?? []) {
  for (const js of script.js ?? []) {
    const content = read(js);
    if (/^\s*(import|export)\b/m.test(content)) {
      errors.push(`${js} contains top-level import/export; manifest content scripts must be bundled as non-module scripts`);
    }
  }
}

if (!allowBroad) {
  if ((manifest.host_permissions ?? []).includes("<all_urls>")) errors.push("host_permissions contains forbidden <all_urls>");
  for (const script of manifest.content_scripts ?? []) {
    if ((script.matches ?? []).includes("<all_urls>")) errors.push("content_scripts.matches contains forbidden <all_urls>");
  }
}

for (const iconPath of Object.values(manifest.icons ?? {})) {
  if (!fs.existsSync(path.join(extensionDir, iconPath))) errors.push(`icon missing: ${iconPath}`);
}
if (manifest.action?.default_popup && !fs.existsSync(path.join(extensionDir, manifest.action.default_popup))) errors.push("popup path is missing");
if (manifest.options_page && !fs.existsSync(path.join(extensionDir, manifest.options_page))) errors.push("options_page path is missing");

const scanned = walk(extensionDir).filter((file) => /\.(js|css|html)$/.test(file));
for (const file of scanned) {
  const text = fs.readFileSync(file, "utf8");
  const relative = path.relative(extensionDir, file);
  if (/https?:\/\/(cdn|unpkg|jsdelivr|fonts\.googleapis|fonts\.gstatic)\./i.test(text)) errors.push(`${relative} contains a remote CDN/font URL`);
  if (/\beval\s*\(/.test(text)) errors.push(`${relative} contains eval()`);
  if (/\bnew\s+Function\s*\(/.test(text)) errors.push(`${relative} contains new Function()`);
  if (/import\s*\(\s*["']https?:\/\//.test(text)) errors.push(`${relative} contains dynamic remote import`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Extension validation passed: ${extensionDir}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
