# Capgo OTA Updates (Option A)

Capgo provides over-the-air (OTA) updates of the web bundle so users get
changes with a single tap — no APK reinstall, no "install unknown apps"
permission.

## One-time setup

1. Create a free account at https://capgo.app and create an app.
2. Note your **App ID** (e.g. `com.chirag.messbuddy`) and **API key**.
3. Install the Capgo CLI: `npm i -g @capgo/cli`
4. Log in: `capgo login <API_KEY>`
5. Add your app: `capgo app add com.chirag.messbuddy`

## Configure the app

`capacitor.config.ts` already includes:

```ts
plugins: {
  CapacitorUpdater: {
    autoUpdate: true,
    directUpdate: 'always',
  },
}
```

`src/App.tsx` calls `CapacitorUpdater.notifyAppReady()` on startup so Capgo
knows the update loaded successfully (otherwise it rolls back automatically).

## Releasing an OTA update

After pushing web changes to `main` (Vercel deploy):

```bash
npm run build
npx cap sync android
capgo bundle upload --channel production
```

Users on the APK will see the new bundle download + apply on next launch
with a single tap, then the app reloads.

## Channels

- `production` — stable channel for all users.
- Create a `beta` channel for testing: `capgo bundle upload --channel beta`,
  then assign test devices to `beta` in the Capgo dashboard.

## Limits

- OTA updates only cover the **web layer** (HTML/JS/CSS). Native changes
  (new Capacitor plugins, AndroidManifest, build.gradle) still require a
  new APK release via the GitHub Actions workflow.
- Free tier has a limited number of updates/month.
- If an update fails to load, Capgo automatically rolls back to the
  previously working bundle.

## Secrets

Store the Capgo API key in your CI secret store (e.g. `CAPGO_API_KEY`) and
in your local environment. Never commit it.
