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
- **Fault codes:** read on demand, and clear after a confirmation.
- **ECU info:** tune number, ident and checksum fixer.
- **Preferences:** units and a light, dark or system theme, in a menu in the top-right corner so the dashboard stays focused on the readings.

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
npm run preview        # serve the production build
```

Tests drive a real `Ecu` against the library's `SimulatedTransport` (or a fake `SerialPort`); see [AGENTS.md](AGENTS.md) for the rules.

CI checks out comm14cux-ts beside the app and builds it before installing.

## Roadmap

- Publish comm14cux-ts to npm (or give it a `prepare` script) and depend on a version range instead of `file:`.
- Deploy to GitHub Pages (HTTPS satisfies Web Serial's secure-context requirement).
- Fuel map viewer, ROM dump download, raw memory read/write, fuel pump and idle-motor tests.
- CSV logging, charts and sparklines.
- Electron packaging. The renderer is plain web code; the main process will need `session.on('select-serial-port')` plus `setPermissionCheckHandler` / `setDevicePermissionHandler` to let the user choose a port.
