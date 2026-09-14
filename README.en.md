# Oshikatsu Manager · 推し活マネージャー

[简体中文](README.md) · **English** · [日本語](README.ja.md)

<img src="assets/icon-only.png" alt="Oshikatsu Manager icon" width="96" />

Track ticket lotteries, advance sales, and general sales for live events in Japan. Search for artists, save performances, check each application round, and set local reminders.

[Download Android APK](https://github.com/aoki-rin/oshikatsu-manager/releases/latest) · [iOS build and installation guide](docs/BUILDING.md#ios) · [Report an issue](https://github.com/aoki-rin/oshikatsu-manager/issues) · [MIT license](LICENSE)

## Download and install

[v1.1.3 release notes](docs/releases/v1.1.3.md): fixes incorrectly merged performances, missing eplus events, calendar deadline times, Lawson events with multiple dates, and Pia busy-page feedback, with compatibility for existing favorites and reminders.

### Android

1. Open the download link above and download `oshikatsu-manager.apk` from **Assets**.
2. Open the APK on your phone, allow installation from that source when prompted, and install it.
3. Grant notification permission as needed, and check your phone's alarm, reminder, and battery restriction settings.

No account, always-on computer, or server deployment is required. All five ticket-source plugins are included; there is nothing extra to download. The official APK connects directly to ticket websites using your phone's network. It does not depend on the maintainer's computer, proxy, or Tailscale, and works with the computer switched off.

Requires Android 7.0 (API 24) or later. Lawson search uses the Google Play Services version of Cronet; compatibility with devices without Google Mobile Services (GMS) has not been verified. Website changes or network restrictions may cause searches to fail. You can open the official ticket page from the app.

To update, download a newer APK from this repository and install it over the existing app using the same signing certificate. Do not uninstall just to resolve a signature mismatch: favorites, follows, and settings are stored locally and may be lost if you uninstall or clear app data.

### iOS

Source code and an [Xcode build and installation guide](docs/BUILDING.md#ios) are available. **There is currently no TestFlight invitation or IPA that anyone can install directly.** You need a Mac, Xcode, and signing with your own Apple account. Uploading an IPA to GitHub does not remove Apple's signing and device authorization requirements. See [Apple's distribution documentation](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases).

## Features and limitations

- Search eplus, Ticket Pia, Lawson Ticket, LivePocket, and TicketDive.
- Follow artists, choose a theme color, save performances, and view application windows in the calendar and event details.
- View parsed dates for multiple lottery rounds, advance sales, and general sales in Japan Standard Time (JST).
- Local notifications on Android and iOS. Android and browser builds support `.ics` calendar export; export is currently hidden on iOS.
- Chinese and Japanese app interfaces. Each ticket source can be enabled or disabled separately. This English README does not add an English app interface.
- This app helps you check information and set reminders. Applications and payments take place on the official ticket websites. Data completeness varies by source; website changes, rate limits, and device notification settings can affect results. Always confirm details on the official page.

This project provides open-source software, not a public proxy service or a guarantee of continued access to ticket websites. Keep request frequency reasonable and follow each platform's terms.

## Run from source: browser preview

Install **Node.js 22.22.1 or later, npm, and Git**. Android and iOS toolchains are only needed when building mobile apps. A `.nvmrc` file is included; with nvm, run `nvm install` and `nvm use` first.

```bash
git clone https://github.com/aoki-rin/oshikatsu-manager.git
cd oshikatsu-manager
npm ci
cp .env.example .env
```

On Windows PowerShell, replace the last line with `Copy-Item .env.example .env`. Alternatively, choose **Code → Download ZIP** on GitHub, extract the archive, and open the project directory.

Open two terminals in the project directory:

```bash
# Terminal 1: local ticket proxy, listening on 127.0.0.1:8787 by default
npm run server:dev
```

```bash
# Terminal 2: web development server
npm run dev
```

Open **http://localhost:3000**. In browser development, Vite forwards search requests to the local proxy, so starting only the web server will not enable search. Ticket websites may still restrict access. Verify system features such as notifications on a phone.

## Build the mobile app

See the [build guide](docs/BUILDING.md) for environment setup, debugging, signing, and installation. The detailed supporting guides are currently primarily in Chinese. For local Android development, you can build a debug APK without the maintainer's signing key:

```bash
npm run build:release
npx cap sync android
cd android
./gradlew assembleDebug
```

On Windows, use `gradlew.bat assembleDebug`. The output is `android/app/build/outputs/apk/debug/app-debug.apk`. Install JDK 21 and Android SDK 36 and configure the SDK path beforehand; see the build guide.

## Configuration

| Use case | Configuration and commands |
|---|---|
| Download the official APK | Already configured for direct connections from the phone; no `.env` needed |
| Browser development | Leave `.env` values empty; run both `server:dev` and `dev` |
| Build a mobile app with direct connections | Run `npm run build:release`, then sync the native project |
| Build a mobile app using your own proxy | Set `VITE_TICKET_PROXY_BASE_URL` in `.env`, run `npm run build`, then sync the native project |

The proxy URL should be an HTTPS address reachable from the phone. When configured, ticket sources try the proxy first and fall back to direct client requests if it fails. Direct requests in a browser may be blocked by CORS.

**`VITE_` values are embedded in the app package. Never put passwords or secrets in them.** After changing configuration, rebuild, sync, and reinstall. `build:release` does not load `.env` files and explicitly clears the proxy URL, so you do not need to move or delete your local configuration.

## Development and tests

```bash
npm run lint           # TypeScript checks
npm run check:version  # Match versions across web, lockfile, Android, and iOS
npm run test:cov       # Unit, component, and native-path tests with coverage
npx playwright install chromium
npm run test:e2e       # Browser workflows using fixed test data
```

Passing automated tests does not establish compatibility with all real ticket websites or phones. Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and the [release guide](docs/RELEASING.md) before publishing a release.

## Project structure

| Path | Contents |
|---|---|
| `src/` | React interface, local state, reminders, and client-side ticket sources |
| `server/` | Optional Express proxy and server-side parsers |
| `android/`, `ios/` | Capacitor native projects |
| `tests/` | Parser, UI, state, and end-to-end tests |
| `docs/adr/` | Architecture decisions and historical context |

Built with React 19, TypeScript, Vite, Capacitor 8, and Express. See [CONTEXT.md](CONTEXT.md) for domain terminology and architecture. Older ADRs record decisions at the time; later decisions may supersede them.

Existing icon assets are ready to build. To regenerate them, run `node _icongen.mjs`, which uses the Sharp development dependency.

## FAQ

**Search fails in the browser?** Confirm that `npm run server:dev` is running, then check the affected source's error in the app. Rate limits, website changes, and network problems still need to be investigated separately.

**Why does a mobile build connect to a private proxy?** A development build may include `.env` values from build time. Run `npm run build:release`, then run `cap sync` and reinstall.

**Android reports an installation failure or signature mismatch?** Debug APKs, third-party builds, and official APKs may use different signing certificates and cannot always update each other. Preserve your data and check the source and signature first; do not immediately uninstall the existing app.

**A macOS build reports `code signature ... different Team IDs`?** The installed Node binary may have signing restrictions that prevent native build dependencies from loading. Use a regular Node installation, such as Homebrew's, and run `npm ci` again.

## Privacy, third-party content, and licensing

Favorites, follows, and settings are saved in local device or browser storage. The project has no account system or cloud sync service. Searches send queries to ticket platforms or your configured proxy; remote images also connect to image hosts. Operating system settings control system backups. See the [privacy notice](docs/PRIVACY.md).

Original project code is licensed under [MIT](LICENSE). Dependencies, third-party ticket content, and test-page excerpts belong to their respective rights holders; the project license does not grant rights to third-party content. See [third-party notices](THIRD_PARTY_NOTICES.md). This project is not officially affiliated with the ticket platforms listed above.
