# 14CUX Gauge

A browser dashboard for the Lucas 14CUX engine ECU: live engine data, stored fault codes and ECU information over a USB serial cable, using the Web Serial API. It is built on the [comm14cux-ts](https://github.com/KB1RMA/comm14cux-ts) library.

> **Status:** pre-release MVP.

## Purpose

The 14CUX was fitted to V8-engined Land Rover vehicles from 1990 to 1995 and to several low-volume sports cars. Its diagnostic port exposes the ECU's memory. 14CUX Gauge reads that memory in the browser and shows it as a dashboard, with nothing to install.

It does the same job as [RoverGauge](https://github.com/colinbourassa/rovergauge), the existing Qt desktop app, but it is a separate, independently designed program and is not a port of it.

This project is not affiliated with or endorsed by the author of libcomm14cux or RoverGauge.

## Features

- **Connect** over Web Serial at 7812 baud, or 15625 baud for double-speed firmware.
- **Demo mode** runs a simulated ECU in the browser (warm-up, idle, a short drive and a rev sweep, with one stored fault code), so you can try the app without a car.
- **Live data:** engine speed, road speed, coolant and fuel temperature, throttle position, airflow, main voltage, short- and long-term lambda trims for both banks, idle bypass position, gear, MIL and fuel pump relay. Choose °F/°C and mph/km/h from the Preferences menu (top right); the choice is remembered.
- **Live graphs:** a Graphs tab plots every reading over the last 30 seconds to 10 minutes, with its current, lowest and highest values as text. Choose which graphs to show; the choice, the time window and the last tab used are remembered.
- **Recorded sessions:** press Record in the status bar to save every reading while connected, then name the recording and add notes when you stop. The Sessions view lists recordings, replays one through the same readings and graphs as the live dashboard (play, pause, scrub and 1×–10× speed, with or without a connection), and lets you rename it, edit its notes or delete it. Recordings are kept in the browser (IndexedDB); if the browser will not store data, they last until the page is closed.
- **Works offline:** the app is a progressive web app. After one visit online it starts from a copy kept on the device, with no network, and can be installed from the browser's menu. It shows a notice when the device is offline, and another when a newer release has been published (by comparing the running build with `version.json`, which is never cached). An update is downloaded in the background and only applied when you choose "Reload to update", with a warning first if an ECU is connected, so it can never restart the page mid-diagnosis.
- **Fault codes:** read on demand, and clear after a confirmation.
- **ECU info:** tune number, ident and checksum fixer.
- **Preferences:** units, a light, dark or system theme, and a choice of colour palettes named after NAS Defender factory paints (Coniston Green, Arles Blue, Alpine White and Beluga Black, British Racing Green), in a menu in the top-right corner so the dashboard stays focused on the readings.

## Accessibility

The app aims to meet WCAG 2.2 AA. It is fully usable with a keyboard and a screen reader, it follows the system's light or dark theme (or the one chosen in Preferences), and it respects reduced-motion settings. Readings are presented as labelled name/value pairs, connection changes are announced, and the confirmation before writing to the ECU is a proper modal dialog. Accessibility is enforced by strict lint rules and by axe-core checks in the test suite. Please report anything that gets in your way as an issue.

## Hardware

You need the same interface cable as RoverGauge: a 5 V FTDI USB-to-serial cable with its Rx line inverted. See the [comm14cux-ts hardware notes](https://github.com/KB1RMA/comm14cux-ts#hardware), including the recommended FTDI latency-timer setting, which makes polling much faster.

## Platform support

Web Serial works in Chromium-based desktop browsers (Chrome, Edge, Opera) and Firefox 151+ on desktop. It does not work in Safari or on iOS/iPadOS. On those browsers the app explains this, and demo mode still works.

The page must be served over HTTPS or from `localhost`. On Linux, your user needs access to the serial device (usually membership of the `dialout` group).

## Safety

Clearing fault codes writes to the ECU's memory. Writing to a running ECU can affect the engine, so the app asks for confirmation first. Stored fault codes cannot be recovered once cleared. This software is provided with absolutely no warranty; see sections 15 and 16 of the licence.

## Credits and licence

- ECU protocol and data decoding: [comm14cux-ts](https://github.com/KB1RMA/comm14cux-ts), derived from [libcomm14cux](https://github.com/colinbourassa/libcomm14cux) © Colin Bourassa, licensed under the GNU GPL v3.
- Graphs: [uPlot](https://github.com/leeoniya/uPlot) © Leon Sorokin, licensed under the MIT licence.
- UI components: [Radix Primitives](https://www.radix-ui.com/primitives) and [Radix Icons](https://www.radix-ui.com/icons) © WorkOS, licensed under the MIT licence.
- The demo mode's memory layout and value encodings come from libcomm14cux via comm14cux-ts. Its ROM image is synthetic and contains no data from a real ROM.

Because it includes a GPL-3.0-only library, this app is licensed under the **GNU General Public License v3.0 only** (`GPL-3.0-only`); see [LICENSE](LICENSE). The deployed build ships source maps, and the app's footer links back to this repository.

Parts of this project were written with the help of an AI assistant. The libcomm14cux and RoverGauge projects do not accept AI-generated contributions, so nothing from this repository will be submitted to them.

## Development

Requires Node.js 24 (see `.nvmrc`).

comm14cux-ts is not on npm yet, so the app expects it checked out **next to** this repository and depends on it as `file:../comm14cux-ts`:

```sh
git clone https://github.com/KB1RMA/comm14cux-ts.git
git clone https://github.com/KB1RMA/14cux-gauge.git

cd comm14cux-ts && npm ci && npm run build && cd ..   # builds dist/, which the app imports
cd 14cux-gauge && npm ci
```

After changing the library, run `npm run build` in it again; the app picks the new `dist/` up through the symlink npm creates. (`npm link` would also work for a one-off override, but it is not recorded in `package.json` or the lockfile, so `npm ci` and CI would lose it.)

```sh
npm run dev            # Vite dev server on http://localhost:5173
npm run lint           # ESLint + Prettier
npm run type:check     # tsc --noEmit, strict
npm test               # Vitest watch mode
npm run test:coverage  # single run, enforces the coverage thresholds
npm run build          # production build in dist/, with source maps
npm run preview        # serve the production build (the only mode with the offline copy)
npm run test:e2e       # acceptance suite against dist/ (build first)
```

Tests drive a real `Ecu` against the library's `SimulatedTransport` (or a fake `SerialPort`); see [AGENTS.md](AGENTS.md) for the rules.

### Acceptance suite

`e2e/` holds a [Playwright](https://playwright.dev) suite that runs the **production build** in Chromium, Firefox and WebKit, served from `/14cux-gauge/` as GitHub Pages serves it. It covers demo mode, preferences, keyboard-only use, axe-core WCAG 2.2 AA checks with colour contrast in every palette, light and dark, the shipped source maps and footer links, and the serial path. For the serial tests, `navigator.serial` is replaced with a port whose far end is comm14cux-ts's byte-level `SimulatedTransport`, so the app's real `WebSerialTransport` code runs.

```sh
npx playwright install   # once, to download the browsers
npm run build && npm run test:e2e
npx playwright show-report test-reports/e2e/html
```

### CI and releases

CI checks out comm14cux-ts beside the app and builds it before installing. On every pull request and push to `main`, `validate.yml` lints, type-checks, runs the unit tests, builds, and runs the acceptance suite against that build. Unit and acceptance test results both go to Codecov; acceptance runs are flagged `e2e-<browser>`.

Releases are managed by [release-please](https://github.com/googleapis/release-please). Write commit messages (or squash-merge pull request titles) as [Conventional Commits](https://www.conventionalcommits.org/): `fix:` makes a patch release, `feat:` a minor one (a patch one while the version is below 1.0), and `feat!:` or a `BREAKING CHANGE:` footer a major one. On every push to `main`, `release-please.yml` keeps a release pull request open that bumps the version in `package.json` and updates `CHANGELOG.md`. Merging it tags the commit `v<version>` and publishes a GitHub release, which starts `release.yml` on that tag. release-please acts as a GitHub App, not with the default `GITHUB_TOKEN`, because events made with that token start no workflows: the release pull request would never get the checks the `main` ruleset requires, and the release would not start `release.yml`. The app needs read and write access to contents, issues and pull requests, and must be installed on this repository; set its client ID and a private key as the `RELEASE_APP_CLIENT_ID` and `RELEASE_APP_PRIVATE_KEY` Actions secrets.

Publishing a GitHub release runs `release.yml`: it tests and builds once, runs the acceptance suite against that build in all three browsers, and only if every test passes attaches the attested build to the release (see below) and deploys the same `dist/` to GitHub Pages. A flaky test (one that passes only on retry) fails the run. Prereleases are attested but not deployed, and a manual run must be on a release's tag. The release build sets `RELEASE_TAG`, so the footer names the release and links to it and to the commit it was built from; the build fails if the tag does not match the version in `package.json`. Any other build's footer says "Development build" and links its commit. The repository's Pages source must be set to **GitHub Actions** (Settings → Pages), and the `github-pages` environment must allow release tags to deploy (Settings → Environments → github-pages → Deployment branches and tags, e.g. a `v*` tag rule).

### Verifying a release

Publishing a GitHub release runs `.github/workflows/release.yml`, which tests and builds the tagged commit and, once the acceptance suite passes, attaches `14cux-gauge-<tag>.zip` (the built app) to the release with three signed attestations:

| Attestation      | Predicate type                                    | Release asset                        |
| ---------------- | ------------------------------------------------- | ------------------------------------ |
| Build provenance | `https://slsa.dev/provenance/v1`                  | `*.provenance.sigstore.json`         |
| SBOM (CycloneDX) | `https://cyclonedx.org/bom`                       | `*.sbom.sigstore.json`, `*.cdx.json` |
| Test results     | `https://in-toto.io/attestation/test-result/v0.1` | `*.test-result.sigstore.json`        |

The test-result attestation lists every unit test and every acceptance test, the latter once per browser as `e2e/<file> > <describe> > <test> [<browser>]`.

Verify a download with the [GitHub CLI](https://cli.github.com/):

```sh
gh attestation verify 14cux-gauge-<tag>.zip --repo KB1RMA/14cux-gauge
gh attestation verify 14cux-gauge-<tag>.zip --repo KB1RMA/14cux-gauge --predicate-type https://cyclonedx.org/bom
gh attestation verify 14cux-gauge-<tag>.zip --repo KB1RMA/14cux-gauge --predicate-type https://in-toto.io/attestation/test-result/v0.1
```

Add `--bundle <file>.sigstore.json` to verify against the attached bundle instead of fetching the attestation from GitHub.

## Roadmap

- Publish comm14cux-ts to npm (or give it a `prepare` script) and depend on a version range instead of `file:`.
- Fuel map viewer, ROM dump download, raw memory read/write, fuel pump and idle-motor tests.
- CSV logging, charts and sparklines.
- Electron packaging. The renderer is plain web code; the main process will need `session.on('select-serial-port')` plus `setPermissionCheckHandler` / `setDevicePermissionHandler` to let the user choose a port.
