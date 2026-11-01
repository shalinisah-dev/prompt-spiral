const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("manifest_version must be 3");
const referenced = [
  manifest.background.service_worker,
  manifest.options_page,
  ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css])
];
for (const file of referenced) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing manifest asset: ${file}`);
}
if (manifest.permissions.some((permission) => ["tabs", "history", "webRequest"].includes(permission))) {
  throw new Error("Unexpected broad permission");
}
console.log(`Validated ${referenced.length} extension assets and least-privilege permissions.`);
