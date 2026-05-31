import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gradleFile = path.join(rootDir, "android", "app", "build.gradle");
const apkSource = process.env.APK_PATH
  ? path.resolve(rootDir, process.env.APK_PATH)
  : path.join(rootDir, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");

if (!existsSync(apkSource)) {
  console.error(`Release APK not found: ${apkSource}`);
  console.error("Run `npm run android:build:release` first, or set APK_PATH to the built APK.");
  process.exit(1);
}

const gradle = readFileSync(gradleFile, "utf8");
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
const appId = gradle.match(/applicationId\s+"([^"]+)"/)?.[1] ?? "com.chirag.messbuddy";

if (!versionName || !Number.isFinite(versionCode)) {
  console.error("Could not read Android versionName/versionCode from android/app/build.gradle.");
  process.exit(1);
}

const apkName = `kanhaiya-mess-v${versionName}.apk`;
const releaseDir = path.join(rootDir, "release");
const packagedApk = path.join(releaseDir, apkName);
mkdirSync(releaseDir, { recursive: true });
copyFileSync(apkSource, packagedApk);

const hash = createHash("sha256").update(readFileSync(packagedApk)).digest("hex");
writeFileSync(`${packagedApk}.sha256`, `${hash}  ${apkName}\n`);

const repository = process.env.GITHUB_REPOSITORY ?? "chiragborse1/messbuddy";
const releaseTag = process.env.APK_RELEASE_TAG ?? `android-v${versionName}`;
const downloadUrl =
  process.env.APK_DOWNLOAD_URL ?? `https://github.com/${repository}/releases/download/${releaseTag}/${apkName}`;

const manifest = {
  appId,
  platform: "android",
  versionName,
  versionCode,
  minimumSupportedVersionCode: Number(process.env.APK_MIN_SUPPORTED_VERSION_CODE ?? versionCode),
  downloadUrl,
  sha256: hash,
  sizeBytes: statSync(packagedApk).size,
  releasedAt: new Date().toISOString(),
  releaseNotes: (process.env.APK_RELEASE_NOTES ?? "Initial sideload APK release.")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
};

const manifestDir = path.join(rootDir, "public", "releases");
mkdirSync(manifestDir, { recursive: true });
writeFileSync(path.join(manifestDir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Packaged ${path.relative(rootDir, packagedApk)}`);
console.log(`SHA-256 ${hash}`);
console.log(`Updated public/releases/latest.json for ${downloadUrl}`);
