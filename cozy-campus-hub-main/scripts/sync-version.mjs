import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const versionName = pkg.version;
// Derive a monotonically increasing versionCode from the version string (major*10000 + minor*100 + patch).
const [major, minor, patch] = versionName.split(".").map((n) => Number(n) || 0);
const versionCode = major * 10000 + minor * 100 + patch;

// 1. appVersion.ts
const appVersionPath = path.join(root, "src", "lib", "appVersion.ts");
let appVersion = fs.readFileSync(appVersionPath, "utf8");
appVersion = appVersion.replace(/export const APP_VERSION_NAME = "[^"]*";/, `export const APP_VERSION_NAME = "${versionName}";`);
appVersion = appVersion.replace(/export const APP_VERSION_CODE = \d+;/, `export const APP_VERSION_CODE = ${versionCode};`);
fs.writeFileSync(appVersionPath, appVersion);

// 2. build.gradle
const gradlePath = path.join(root, "android", "app", "build.gradle");
let gradle = fs.readFileSync(gradlePath, "utf8");
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${versionName}"`);
fs.writeFileSync(gradlePath, gradle);

// 3. latest.json
const manifestPath = path.join(root, "public", "releases", "latest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.versionName = versionName;
manifest.versionCode = versionCode;
manifest.minimumSupportedVersionCode = versionCode;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`Synced version ${versionName} (code ${versionCode}) to appVersion.ts, build.gradle, latest.json`);
