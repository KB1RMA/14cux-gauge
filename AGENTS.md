# Agent instructions

These rules apply to any AI coding agent or assistant working in this repository, including when reviewing changes. Most of them exist to keep the project compliant with the GNU GPL v3; the testing rules keep the test suite exercising the app the way it really talks to the ECU. When a rule conflicts with a task, stop and ask the maintainer instead of working around it.

## Licence

- This project is licensed **`GPL-3.0-only`**. Never write `GPL-3.0-or-later`, `GPL-3.0+`, or any other licence identifier. The app bundles comm14cux-ts, which is GPL v3 without an "or later" clause, so this project cannot offer later versions either.
- Never modify, shorten or replace `LICENSE`. It is the verbatim GPL v3 text from gnu.org.
- `package.json` must declare `"license": "GPL-3.0-only"` and keep `"private": true`; the app is deployed, not published to npm.

## File headers

Every source file (TypeScript, CSS, config) needs a header. Use the form that matches the file's origin.

**Files whose logic, constants or memory offsets come from libcomm14cux or comm14cux-ts** (for example `src/demo/`, which encodes raw ECU memory):

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// <what was taken>; written for 14cux-gauge, <YEAR>.
```

**Files written from scratch for this project:**

```ts
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) <YEAR> 14cux-gauge contributors
```

- Never remove or weaken an existing copyright or attribution line.
- When in doubt about a file's origin, use the "derived" header. Over-attributing is safe; under-attributing is not.
- When substantially changing a derived file in a later year, add that year to its last header line (GPL v3 §5(a)).

## RoverGauge

- Do not read, port or imitate RoverGauge's source. Design the UI fresh.
- If anything is ever ported from it, that file needs a "Derived from RoverGauge (https://github.com/colinbourassa/rovergauge), Copyright (C) Colin Bourassa, GPL v3" header.

## Dependencies

Code that is bundled into the shipped app must be under a GPL-3.0-compatible licence. Check the licence of every new runtime dependency before adding it.

- **Allowed:** MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Apache-2.0, Zlib, CC0-1.0, Unlicense, MPL-2.0, LGPL-2.1-or-later, LGPL-3.0, GPL-2.0-or-later, GPL-3.0.
- **Ask the maintainer first:** AGPL-3.0, any licence not listed here, and anything with no licence at all.
- **Never add:** GPL-2.0-only, EPL-1.0, CDDL, SSPL, BUSL, BSD-4-Clause, any Creative Commons "NonCommercial" or "NoDerivatives" licence, or proprietary code.

Development-only tools that are not bundled (test runners, linters, build tools) do not have to be GPL-compatible.

Keep the dependency set small. Do not add a state-management library, router or charting library without asking.

## UI components

- [Radix Primitives](https://www.radix-ui.com/primitives) (the `radix-ui` package, MIT) is the UI component base, with `@radix-ui/react-icons` for icons. Build interactive widgets that have an ARIA pattern (menus, dialogs, checkboxes, radio groups, toggles, tabs, tooltips) from the matching Radix primitive rather than hand-rolling the keyboard and ARIA behaviour. Import from `'radix-ui'`, not the individual `@radix-ui/react-*` packages.
- Radix is unstyled. Style it with CSS modules and the tokens in `src/styles/theme.css`, using its `data-state` / `data-highlighted` attributes for state. Do not add Radix Themes or another UI kit without asking.
- Keep the main view for the readings. User preferences (units, theme) belong in `PreferencesMenu` in the app bar, not on the dashboard; add new ones there and to `PreferencesProvider`.

## Copying code

- Do not paste code from other projects, Stack Overflow answers, blog posts or other sources unless its licence is on the allowed list above. When you do, keep its copyright notice and add it to the credits in `README.md`.
- Do not reproduce code from memory of other projects. Write it fresh.

## Source availability

Serving the JS bundle to a browser is distribution under the GPL.

- Keep `build.sourcemap: true` in `vite.config.ts`.
- Keep the footer links to the source repository and the licence.
- Keep the `repository` field in `package.json` pointing at the public repo.

## Upstream projects

- Do not open issues, pull requests or patches against libcomm14cux or RoverGauge from this repository. Those projects prohibit AI-generated contributions.
- Keep the credits and "not affiliated with or endorsed by" statement in `README.md` and the footer intact.

## Names and trademarks

- "Rover", "Land Rover", "Lucas" and "RoverGauge" are other parties' names and trademarks. Do not use them in identifiers, package names, the page title, logos or branding. Describing compatibility in prose ("for the Lucas 14CUX ECU") is fine. "14CUX" is used descriptively.
- JavaScript identifiers cannot start with a digit; use `cuxGauge` / `CuxGauge` in code.

## Browser and Electron

- The app must stay plain web code: no Node APIs in `src/`, so it can later run unchanged in an Electron renderer.
- Wrap every `localStorage` access in `try`/`catch`; the app must work without storage.

## ECU safety

- Any UI action that writes to the ECU (clearing faults, writing memory, actuator tests) must sit behind `ConfirmDialog` with text that states the risk.
- Do not add text that implies a warranty or fitness for purpose. GPL v3 §15–16 disclaim both, and the README's Safety section must stay.

## Accessibility

The app must be usable with a keyboard alone and with a screen reader, and meet WCAG 2.2 AA.

- Use native elements for structure and content: `<button>`, `<dl>` for name/value readings, `<output>` for the connection status. For interactive widgets use the Radix primitive (see UI components), such as `ConfirmDialog` (Radix `AlertDialog`) for confirmations. Never add ARIA roles by hand to recreate a widget Radix provides.
- Live regions announce only meaningful state changes (connecting, connected, disconnected, errors). Never put fast-changing values such as live readings or the sample rate inside one.
- Radix menus and dialogs are modal: they hide the rest of the page from assistive tech while open. In tests, close them before querying the page behind.
- When a view replaces another, move focus to the new view's heading (`tabIndex={-1}`) or to the obvious next control, as the dashboard, connect screen and status bar do.
- Colour must never be the only signal (the MIL tile says "On"). Text needs 4.5:1 contrast and control borders and focus rings 3:1, in both light and dark themes; check new colour pairs when adding them, because jsdom cannot.
- Links that leave the app open in a new tab via `ExternalLink`, which says so to screen readers.
- Every new view or component gets an `expectNoAxeViolations` test (`src/test-support/a11y.ts`), and tests find elements by role and accessible name.
- `jsx-a11y-x` runs its strict rule set as errors. Do not relax it to land a change.

## Linting

- `npm run lint` fails on any warning. Every rule in the React and accessibility (`jsx-a11y-x` strict) presets is an error, including `react-hooks/exhaustive-deps`, `react-hooks/set-state-in-effect` and the other React Compiler rules.
- Fix the code rather than disabling a rule. If a rule must be disabled, do it for one line with `// eslint-disable-next-line <rule> -- <reason>`. Never turn a React rule off or down to a warning in `eslint.config.js` to land a change.
- Component files (`.tsx`) export only components, so Vite Fast Refresh works. Put contexts, hooks and helpers in their own modules.

## Tests

- Tests use comm14cux-ts's **public API** only: import from `'comm14cux-ts'`, never from its `src/` internals or `dist/` files.
- Drive the ECU through a real `Ecu` over `SimulatedTransport` with bytes planted in `memory` (or its fault-injection flags), or over `WebSerialTransport` with a fake `SerialPort`. Do not mock `Ecu` methods.
- Write expected values as literals; do not compute them by calling library decoders.
- Name test files `*.test.ts(x)` next to the code they test. Do not lower the coverage thresholds in `vite.config.ts` to land a change.
