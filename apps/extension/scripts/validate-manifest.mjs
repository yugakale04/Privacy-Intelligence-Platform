import { readFile } from "node:fs/promises";

const manifestPath = process.argv[2];
if (!manifestPath) {
  throw new Error("Provide the manifest path to validate.");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error("The extension manifest must use Manifest V3.");
}

const expectedPermissions = ["activeTab", "scripting"];
const expectedHostPermissions = ["http://127.0.0.1:3000/*"];
if (JSON.stringify(manifest.permissions) !== JSON.stringify(expectedPermissions)
  || JSON.stringify(manifest.host_permissions) !== JSON.stringify(expectedHostPermissions)) {
  throw new Error("M4 may request only activeTab, scripting, and the local development backend origin.");
}

console.log("Manifest V3 validation passed.");
