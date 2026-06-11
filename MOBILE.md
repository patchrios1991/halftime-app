# HalfTime — Mobile Store Builds (Capacitor)

The app is wrapped with [Capacitor](https://capacitorjs.com). The native
projects live in `android/` and `ios/` and load the bundled web build from
`dist/`. App ID: `com.halftimeapp.app`.

## Everyday workflow

After changing web code, refresh the native projects:

```
npm run build:mobile     # vite build + cap sync
```

Icons/splash are generated from `assets/` (source: `assets/icon.png`):

```
npx @capacitor/assets generate --iconBackgroundColor "#060F08" --splashBackgroundColor "#060F08"
```

## Status

| Step | Status | Needs |
|------|--------|-------|
| Capacitor wrap + both platforms | ✅ done | — |
| Native icons + splash (126 assets) | ✅ done | — |
| Approval gate for store users | ✅ done | — |
| In-app account deletion (Apple 5.1.1) | ✅ done | — |
| Android build (AAB) | ✅ done | signed AAB + APK build locally (see below) |
| Google Play listing + upload | ⬜ | Play Console account ($25 one-time) |
| Apple Developer enrollment | ⬜ | $99/yr, web signup |
| Sign in with Apple | ⬜ | Apple Dev account first; REQUIRED because app offers Google sign-in (guideline 4.8) |
| Native Google OAuth flow | ⬜ | see "Known work" below |
| iOS build + App Store upload | ⬜ | Mac with Xcode (or cloud: Codemagic / GitHub Actions macOS) |

## Known work before store submission

1. **Google sign-in inside the native app will fail as-is.** Google blocks
   OAuth in embedded WebViews (`disallowed_useragent`). Fix: open the OAuth
   URL in the system browser via `@capacitor/browser` with
   `skipBrowserRedirect`, and deep-link back into the app
   (`signInWithOAuth({ options: { redirectTo: 'com.halftimeapp.app://auth-callback' }})`
   plus Android App Links / iOS Universal Links). Email/password and magic
   links work without this.
2. **Deep links** for `/join/:code` and `/guest/:code` should open the app:
   host `.well-known/assetlinks.json` (Android) and
   `.well-known/apple-app-site-association` (iOS) on app.halftime-app.com.
3. **Apple review prep**: demo account credentials for the reviewer, privacy
   nutrition labels in App Store Connect, screenshots (6.7" + 5.5" iPhone).

## Android (no Mac needed) — set up on this PC, June 2026

Toolchain installed and working on this machine:

- **JDK 21**: `C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot`
- **Android SDK**: `C:\Android\Sdk` (platform 36, build-tools 36.0.0).
  Deliberately NOT under AppData — Claude Desktop's MSIX container
  redirects AppData writes into its LocalCache, hiding them from normal
  processes.
- **Upload keystore**: `..\keys\halftime-upload.keystore` (outside the
  repo, in OneDrive for backup — see `keys\README.txt`). Passwords in
  `android\keystore.properties` (gitignored). BACK UP THE KEYS FOLDER.
- Release signing is wired into `app/build.gradle` via
  `keystore.properties`; builds stay unsigned if that file is absent.

Build commands (from `android\`):

```
gradlew.bat bundleRelease    # AAB for Play Console
gradlew.bat assembleRelease  # APK for direct installs / testing
```

Outputs land in `android\app\build\outputs\{bundle,apk}\release\`.
Bump `versionCode` (and `versionName`) in `android\app\build.gradle`
before each Play upload. Run `npm run build:mobile` first so the web
bundle is current.

> Note for Claude Code sessions: Gradle cannot run as a child of the
> sandboxed shell (Java NIO selectors die with "Unable to establish
> loopback connection"). Launch it via WMI instead using
> `android\ci-build.cmd <task>` through
> `Invoke-CimMethod -ClassName Win32_Process -MethodName Create`;
> it writes `ci-build-log.txt` + `ci-build-exit.txt`.

To upload: Play Console → create app → upload AAB to internal testing,
then promote to production.

## iOS (Mac or cloud Mac)

1. On the Mac: clone repo, `npm install`, `npm run build:mobile`,
   `npx cap open ios`.
2. Xcode: set the team (Apple Dev account), let it manage signing.
3. Product → Archive → Distribute → App Store Connect.
4. No Mac? Codemagic's free tier or a GitHub Actions `macos` runner can
   archive + upload with an App Store Connect API key.
