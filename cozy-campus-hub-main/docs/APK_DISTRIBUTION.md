# APK Distribution

Kanhaiya Mess is distributed outside the Play Store, so every public APK must be a signed release build. Never share a debug APK.

## One-time Signing Setup

Create a release keystore once and keep it backed up. Future APK updates must use the same keystore, otherwise Android will reject the update over the existing app.

1. Copy the template:

```bash
cp android/keystore.properties.example android/keystore.properties
```

2. Generate the keystore:

```bash
keytool -genkeypair -v \
  -keystore android/app/kanhaiya-mess-release.jks \
  -storetype JKS \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias kanhaiya-mess \
  -dname "CN=Kanhaiya Mess, OU=MessBuddy, O=Kanhaiya Mess, L=Jalgaon, ST=Maharashtra, C=IN"
```

3. Put the passwords in `android/keystore.properties`.

Both `android/keystore.properties` and the keystore file are ignored by git.

## Local Release Build

```bash
npm run android:release
```

This builds the web app, syncs Capacitor, creates the signed APK, copies it to `release/`, writes a `.sha256` checksum, and updates `public/releases/latest.json`.

## GitHub Actions Release Build

Use this when the local machine should not build Android.

Add these repository secrets in GitHub:

- `ANDROID_KEYSTORE_BASE64`: base64 of `android/app/kanhaiya-mess-release.jks`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Create the base64 value:

```bash
base64 -w 0 android/app/kanhaiya-mess-release.jks
```

Then run the `Android APK Release` workflow from GitHub Actions. It builds the signed APK, uploads it to a GitHub Release, commits the updated release manifest, and exposes the download page at:

```text
https://messbuddy-ten.vercel.app/apk.html
```

## Release Checklist

1. Increase `versionCode` and `versionName` in `android/app/build.gradle`.
2. Keep `src/lib/appVersion.ts` in sync with the Android version.
3. Build with `npm run android:release` or the GitHub Actions release workflow.
4. Upload the APK and `.sha256` file to GitHub Releases if building locally.
5. Push the updated `public/releases/latest.json` so APK users see the in-app update prompt.
6. Share only `https://messbuddy-ten.vercel.app/apk.html` or the official GitHub Release URL.
