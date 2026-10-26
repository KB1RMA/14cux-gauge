// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Gear } from '@kb1rma/libcomm14cux-ts';
import type { LiveSnapshot } from '../model/snapshot';
import { browserPlatform } from '../platform/browser';
import { TestPlatform } from '../test-support/TestApp';
import { testPlatform } from '../test-support/platform';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations, readingFor } from '../test-support/a11y';
import { SnapshotTiles } from './LiveTiles';
import { PreferencesMenu } from './PreferencesMenu';

const SNAPSHOT: LiveSnapshot = {
  timestamp: 0,
  engineRpm: 750,
  roadSpeedMph: 62,
  throttle: 0.25,
  airflow: 0.1,
  lambdaShortOdd: 0,
  lambdaShortEven: 0,
  idleBypass: 0.5,
  gear: Gear.ParkOrNeutral,
  milOn: false,
  fuelPumpOn: true,
  injectorPulseUs: 2350,
  fuelMapRow: 1.5,
  fuelMapColumn: 2.25,
  coolantTempF: 212,
  fuelTempF: 95,
  mainVoltage: 14.1,
  lambdaLongOdd: 0,
  lambdaLongEven: 0,
  idleMode: true,
  targetIdleRpm: 740,
};

function renderWithTiles() {
  return render(
    <TestPlatform platform={browserPlatform()}>
      <PreferencesProvider>
        <PreferencesMenu />
        <SnapshotTiles snapshot={SNAPSHOT} />
      </PreferencesProvider>
    </TestPlatform>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Preferences' });
}

describe('PreferencesMenu', () => {
  it('is a single labelled button until opened', () => {
    renderWithTiles();

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('groups the choices and marks the current ones', async () => {
    const user = userEvent.setup();

    renderWithTiles();
    await user.click(trigger());

    const menu = screen.getByRole('menu', { name: 'Preferences' });

    expect(
      within(menu)
        .getAllByRole('group')
        .map((group) => group.getAttribute('aria-labelledby'))
        .map((id) => document.getElementById(id ?? '')?.textContent),
    ).toEqual(['Temperature', 'Speed', 'Gauge style', 'Theme', 'Paint']);
    expect(
      within(menu).getByRole('menuitemradio', { name: /^Fahrenheit / }),
    ).toBeChecked();
    expect(
      within(menu).getByRole('menuitemradio', { name: /^Miles per hour / }),
    ).toBeChecked();
    expect(
      within(menu).getByRole('menuitemradio', { name: 'System' }),
    ).toBeChecked();
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Coniston Green' }),
    ).toBeChecked();
  });

  it('draws dials when chosen, without changing what the readings say', async () => {
    const user = userEvent.setup();
    const { container } = renderWithTiles();
    /** The picture beside a reading, hidden from assistive tech. */
    const picture = (label: string) =>
      readingFor(label).querySelector('[aria-hidden="true"]');

    expect(picture('Coolant')).toBeNull();

    await user.click(trigger());

    const choices = screen.getByRole('menu', { name: 'Preferences' });

    expect(
      within(choices).getByRole('menuitemradio', { name: 'Tiles' }),
    ).toBeChecked();
    await user.click(
      within(choices).getByRole('menuitemradio', { name: 'Dials' }),
    );
    expect(
      within(choices).getByRole('menuitemradio', { name: 'Dials' }),
    ).toBeChecked();
    await user.keyboard('{Escape}');

    for (const label of [
      'Engine speed',
      'Road speed',
      'Coolant',
      'Fuel temp',
    ]) {
      expect(picture(label)).not.toBeNull();
    }

    // Readings without a dial stay as they were, after the dials.
    expect(picture('Target idle')).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Engine' }))
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual([
      'Engine speed',
      'Road speed',
      'Coolant',
      'Fuel temp',
      'Target idle',
    ]);
    // Exactly the reading, as a tile shows it: the scale adds no text.
    expect(readingFor('Engine speed')).toHaveTextContent(/^750 rpm$/);
    expect(readingFor('Road speed')).toHaveTextContent(/^62 mph$/);
    expect(readingFor('Coolant')).toHaveTextContent(/^212 °F$/);
    expect(readingFor('Fuel temp')).toHaveTextContent(/^95 °F$/);
    await expectNoAxeViolations(container);

    await user.click(trigger());
    await user.click(screen.getByRole('menuitemradio', { name: /^Celsius / }));
    await user.click(
      screen.getByRole('menuitemradio', { name: /^Kilometres per hour / }),
    );
    await user.keyboard('{Escape}');

    // 62 mph is 99.78 km/h; 212 °F is 100 °C and 95 °F is 35 °C.
    expect(readingFor('Road speed')).toHaveTextContent(/^100 km\/h$/);
    expect(readingFor('Coolant')).toHaveTextContent(/^100 °C$/);
    expect(readingFor('Fuel temp')).toHaveTextContent(/^35 °C$/);

    await user.click(trigger());

    const menu = screen.getByRole('menu', { name: 'Preferences' });

    expect(
      within(menu).getByRole('menuitemradio', { name: 'Dials' }),
    ).toBeChecked();
    await user.click(
      within(menu).getByRole('menuitemradio', { name: 'Tiles' }),
    );
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Tiles' }),
    ).toBeChecked();
    await user.keyboard('{Escape}');

    // Tiles draw no dials, and say the same.
    expect(picture('Coolant')).toBeNull();
    expect(picture('Engine speed')).toBeNull();
    expect(readingFor('Coolant')).toHaveTextContent(/^100 °C$/);
    expect(readingFor('Road speed')).toHaveTextContent(/^100 km\/h$/);
  });

  it('converts readings when the units change, and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithTiles();

    expect(readingFor('Coolant')).toHaveTextContent('212 °F');
    expect(readingFor('Road speed')).toHaveTextContent('62 mph');

    await user.click(trigger());
    await user.click(screen.getByRole('menuitemradio', { name: /^Celsius / }));
    await user.click(
      screen.getByRole('menuitemradio', { name: /^Kilometres per hour / }),
    );

    expect(
      screen.getByRole('menuitemradio', { name: /^Celsius / }),
    ).toBeChecked();

    // The menu is modal: the page behind it is hidden from assistive tech
    // until it closes.
    await user.keyboard('{Escape}');

    expect(readingFor('Coolant')).toHaveTextContent('100 °C');
    expect(readingFor('Fuel temp')).toHaveTextContent('35 °C');
    expect(readingFor('Road speed')).toHaveTextContent('100 km/h');

    unmount();
    renderWithTiles();

    expect(readingFor('Coolant')).toHaveTextContent('100 °C');
    expect(readingFor('Road speed')).toHaveTextContent('100 km/h');
  });

  it('works from the keyboard and returns focus to the button on Escape', async () => {
    const user = userEvent.setup();

    renderWithTiles();
    await user.tab();

    expect(trigger()).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('menuitemradio', { name: /^Fahrenheit / }),
    ).toHaveFocus();

    await user.keyboard('{ArrowDown}{Enter}');

    expect(
      screen.getByRole('menuitemradio', { name: /^Celsius / }),
    ).toBeChecked();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(readingFor('Coolant')).toHaveTextContent('100 °C');
  });

  it('switches the colour theme, and follows the system again on System', async () => {
    const user = userEvent.setup();
    const root = document.documentElement;

    renderWithTiles();

    expect(root).not.toHaveAttribute('data-theme');

    await user.click(trigger());
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    expect(root).toHaveAttribute('data-theme', 'dark');

    await user.click(screen.getByRole('menuitemradio', { name: 'Light' }));

    expect(root).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('menuitemradio', { name: 'System' }));

    expect(root).not.toHaveAttribute('data-theme');
  });

  it('saves the units, gauge style, theme and paint, and restores them on the next visit', async () => {
    const user = userEvent.setup();
    const first = renderWithTiles();

    expect(localStorage.getItem('cuxGauge.preferences')).toBeNull();

    await user.click(trigger());
    await user.click(screen.getByRole('menuitemradio', { name: /Celsius/ }));
    await user.click(
      screen.getByRole('menuitemradio', { name: /Kilometres per hour/ }),
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Arles Blue' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Dials' }));

    expect(
      JSON.parse(localStorage.getItem('cuxGauge.preferences') ?? 'null'),
    ).toEqual({
      temperatureUnit: 'C',
      speedUnit: 'kmh',
      theme: 'dark',
      palette: 'arles',
      gaugeStyle: 'dials',
      usageCounts: 'on',
      keepScreenOn: false,
    });

    first.unmount();
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['palette'];
    renderWithTiles();

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-palette', 'arles');
    await user.click(trigger());
    expect(
      screen.getByRole('menuitemradio', { name: /Celsius/ }),
    ).toBeChecked();
    expect(
      screen.getByRole('menuitemradio', { name: /Kilometres per hour/ }),
    ).toBeChecked();
    expect(
      screen.getByRole('menuitemradio', { name: 'Arles Blue' }),
    ).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Dials' })).toBeChecked();
  });

  it('applies a stored theme on load', () => {
    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ theme: 'dark' }),
    );

    renderWithTiles();

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('switches the paint palette, with Coniston Green as the default', async () => {
    const user = userEvent.setup();
    const root = document.documentElement;

    renderWithTiles();

    expect(root).not.toHaveAttribute('data-palette');

    await user.click(trigger());
    await user.click(screen.getByRole('menuitemradio', { name: 'Arles Blue' }));

    expect(root).toHaveAttribute('data-palette', 'arles');

    await user.click(
      screen.getByRole('menuitemradio', {
        name: 'Alpine White and Beluga Black',
      }),
    );

    expect(root).toHaveAttribute('data-palette', 'alpine-beluga');

    await user.click(
      screen.getByRole('menuitemradio', { name: 'British Racing Green' }),
    );

    expect(root).toHaveAttribute('data-palette', 'racing-green');
    expect(
      screen.getByRole('menuitemradio', { name: 'British Racing Green' }),
    ).toBeChecked();

    await user.click(
      screen.getByRole('menuitemradio', { name: 'Coniston Green' }),
    );

    expect(root).not.toHaveAttribute('data-palette');
  });

  it('applies a stored palette on load, alongside the theme', () => {
    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ theme: 'dark', palette: 'arles' }),
    );

    renderWithTiles();

    expect(document.documentElement).toHaveAttribute('data-palette', 'arles');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('falls back to Coniston Green for an unknown stored palette', async () => {
    const user = userEvent.setup();

    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ palette: 'portofino-red' }),
    );

    renderWithTiles();

    expect(document.documentElement).not.toHaveAttribute('data-palette');

    await user.click(trigger());

    expect(
      screen.getByRole('menuitemradio', { name: 'Coniston Green' }),
    ).toBeChecked();
  });

  it('offers the usage-counts choice where the app counts usage', async () => {
    const user = userEvent.setup();

    render(
      <TestPlatform platform={browserPlatform()}>
        <PreferencesProvider>
          <PreferencesMenu offerUsageCounts />
        </PreferencesProvider>
      </TestPlatform>,
    );
    await user.click(trigger());

    const menu = screen.getByRole('menu', { name: 'Preferences' });
    const group = within(menu).getByRole('group', { name: 'Usage counts' });

    expect(
      within(group).getByRole('menuitemradio', {
        name: 'Count my visits anonymously',
      }),
    ).toBeChecked();

    await user.click(
      within(group).getByRole('menuitemradio', {
        name: 'Don’t count my visits',
      }),
    );

    expect(
      JSON.parse(localStorage.getItem('cuxGauge.preferences') ?? 'null'),
    ).toMatchObject({ usageCounts: 'off' });
    await expectNoAxeViolations(menu);
  });

  it('has no detectable accessibility violations, closed or open', async () => {
    const user = userEvent.setup();

    renderWithTiles();
    await expectNoAxeViolations(document.body);
    await user.click(trigger());
    await expectNoAxeViolations(screen.getByRole('menu'));
  });

  it('offers to keep the screen on, off by default, and remembers the choice', async () => {
    const user = userEvent.setup();
    const awake = {
      available: () => true,
      request: () => Promise.reject(new Error('Not used in this test')),
      onVisible: () => () => undefined,
    };
    const { screen: base } = browserPlatform();

    render(
      <TestPlatform
        platform={browserPlatform({
          screen: { ...base, wakeLock: awake },
        })}
      >
        <PreferencesProvider>
          <PreferencesMenu />
        </PreferencesProvider>
      </TestPlatform>,
    );
    await user.click(trigger());

    const item = screen.getByRole('menuitemcheckbox', {
      name: 'Keep the screen on while connected',
    });

    expect(item).not.toBeChecked();
    expect(item).toBeEnabled();

    await user.click(item);

    expect(item).toBeChecked();
    expect(
      JSON.parse(localStorage.getItem('cuxGauge.preferences') ?? 'null'),
    ).toMatchObject({ keepScreenOn: true });
  });

  it('says keeping the screen on is not supported, and cannot be chosen, without a wake lock', async () => {
    const user = userEvent.setup();

    render(
      <TestPlatform platform={testPlatform()}>
        <PreferencesProvider>
          <PreferencesMenu />
        </PreferencesProvider>
      </TestPlatform>,
    );
    await user.click(trigger());

    const item = screen.getByRole('menuitemcheckbox', {
      name: /Keep the screen on while connected/,
    });

    expect(item).toHaveTextContent('Not supported');
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });
});
