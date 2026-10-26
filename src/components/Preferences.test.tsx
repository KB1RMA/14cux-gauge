// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Gear } from '@kb1rma/libcomm14cux-ts';
import type { LiveSnapshot } from '../model/snapshot';
import { browserPlatform } from '../platform/browser';
import { TestPlatform } from '../test-support/TestApp';
import { testPlatform } from '../test-support/platform';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations, readingFor } from '../test-support/a11y';
import { SnapshotTiles } from './LiveTiles';
import { Preferences } from './Preferences';

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

function renderWithTiles(at = '/live') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <TestPlatform platform={browserPlatform()}>
        <PreferencesProvider>
          <Preferences />
          <SnapshotTiles snapshot={SNAPSHOT} />
        </PreferencesProvider>
      </TestPlatform>
    </MemoryRouter>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Preferences' });
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Preferences' });
}

/** Opens Preferences at `section`, as the user does from the app bar. */
async function openPreferences(
  user: UserEvent,
  section: 'General' | 'Appearance' | 'Limits' = 'General',
): Promise<HTMLElement> {
  await user.click(trigger());
  await user.click(within(dialog()).getByRole('tab', { name: section }));

  return dialog();
}

function radio(scope: HTMLElement, name: string | RegExp): HTMLElement {
  return within(scope).getByRole('radio', { name });
}

/** Closes Preferences, so the page behind is no longer hidden. */
async function closePreferences(user: UserEvent) {
  await user.click(
    within(dialog()).getByRole('button', { name: 'Close preferences' }),
  );
}

describe('Preferences', () => {
  it('is a single labelled button until opened', () => {
    renderWithTiles();

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a dialog of sections, starting with General', async () => {
    const user = userEvent.setup();

    renderWithTiles();
    await user.click(trigger());

    expect(
      within(dialog())
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['General', 'Appearance', 'Limits']);
    expect(
      within(dialog()).getByRole('tab', { selected: true }),
    ).toHaveTextContent('General');
    expect(
      within(dialog())
        .getAllByRole('radiogroup')
        .map((group) => group.getAttribute('aria-labelledby'))
        .map((id) => document.getElementById(id ?? '')?.textContent),
    ).toEqual(['Temperature', 'Speed', 'Gauge style']);
    expect(radio(dialog(), 'Fahrenheit (°F)')).toBeChecked();
    expect(radio(dialog(), 'Miles per hour (mph)')).toBeChecked();
    expect(radio(dialog(), 'Tiles')).toBeChecked();

    await user.click(within(dialog()).getByRole('tab', { name: 'Appearance' }));

    expect(
      within(dialog())
        .getAllByRole('radiogroup')
        .map((group) => group.getAttribute('aria-labelledby'))
        .map((id) => document.getElementById(id ?? '')?.textContent),
    ).toEqual(['Theme', 'Paint']);
    expect(radio(dialog(), 'System')).toBeChecked();
    expect(radio(dialog(), 'Coniston Green')).toBeChecked();

    await user.click(within(dialog()).getByRole('tab', { name: 'Limits' }));

    expect(
      within(dialog()).getByRole('group', { name: 'Coolant (°F)' }),
    ).toBeInTheDocument();
  });

  it('opens at the section its address names, and General for an unknown one', async () => {
    const { unmount } = renderWithTiles('/live?preferences=limits');

    expect(
      within(dialog()).getByRole('tab', { selected: true }),
    ).toHaveTextContent('Limits');

    unmount();
    renderWithTiles('/dash?preferences=nonsense');

    expect(
      within(dialog()).getByRole('tab', { selected: true }),
    ).toHaveTextContent('General');
  });

  it('closes from the button or Escape, returning focus to the gear', async () => {
    const user = userEvent.setup();

    renderWithTiles();
    await user.tab();

    expect(trigger()).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(dialog()).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();

    await user.click(trigger());
    await closePreferences(user);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('closes when opened from a link, leaving the view behind it', async () => {
    const user = userEvent.setup();

    renderWithTiles('/live?preferences=appearance');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(readingFor('Coolant')).toHaveTextContent('212 °F');
  });

  it('draws dials when chosen, without changing what the readings say', async () => {
    const user = userEvent.setup();
    const { container } = renderWithTiles();
    /** The picture beside a reading, hidden from assistive tech. */
    const picture = (label: string) =>
      readingFor(label).querySelector('[aria-hidden="true"]');

    expect(picture('Coolant')).toBeNull();

    await openPreferences(user);
    await user.click(radio(dialog(), 'Dials'));

    expect(radio(dialog(), 'Dials')).toBeChecked();

    await closePreferences(user);

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

    await openPreferences(user);
    await user.click(radio(dialog(), 'Celsius (°C)'));
    await user.click(radio(dialog(), 'Kilometres per hour (km/h)'));
    await closePreferences(user);

    // 62 mph is 99.78 km/h; 212 °F is 100 °C and 95 °F is 35 °C.
    expect(readingFor('Road speed')).toHaveTextContent(/^100 km\/h$/);
    expect(readingFor('Coolant')).toHaveTextContent(/^100 °C$/);
    expect(readingFor('Fuel temp')).toHaveTextContent(/^35 °C$/);

    await openPreferences(user);

    expect(radio(dialog(), 'Dials')).toBeChecked();

    await user.click(radio(dialog(), 'Tiles'));
    await closePreferences(user);

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

    await openPreferences(user);
    await user.click(radio(dialog(), 'Celsius (°C)'));
    await user.click(radio(dialog(), 'Kilometres per hour (km/h)'));

    expect(radio(dialog(), 'Celsius (°C)')).toBeChecked();

    // The dialog is modal: the page behind it is hidden from assistive tech
    // until it closes.
    await closePreferences(user);

    expect(readingFor('Coolant')).toHaveTextContent('100 °C');
    expect(readingFor('Fuel temp')).toHaveTextContent('35 °C');
    expect(readingFor('Road speed')).toHaveTextContent('100 km/h');

    unmount();
    renderWithTiles();

    expect(readingFor('Coolant')).toHaveTextContent('100 °C');
    expect(readingFor('Road speed')).toHaveTextContent('100 km/h');
  });

  it('works from the keyboard: arrows move within a group, Space chooses', async () => {
    const user = userEvent.setup();

    renderWithTiles();
    await user.click(trigger());
    radio(dialog(), 'Fahrenheit (°F)').focus();
    await user.keyboard('{ArrowRight}');

    expect(radio(dialog(), 'Celsius (°C)')).toHaveFocus();

    await user.keyboard(' ');

    expect(radio(dialog(), 'Celsius (°C)')).toBeChecked();

    // Tab leaves the group for the next setting.
    await user.tab();

    expect(radio(dialog(), 'Miles per hour (mph)')).toHaveFocus();
  });

  it('switches the colour theme, and follows the system again on System', async () => {
    const user = userEvent.setup();
    const root = document.documentElement;

    renderWithTiles();

    expect(root).not.toHaveAttribute('data-theme');

    await openPreferences(user, 'Appearance');
    await user.click(radio(dialog(), 'Dark'));

    expect(root).toHaveAttribute('data-theme', 'dark');

    await user.click(radio(dialog(), 'Light'));

    expect(root).toHaveAttribute('data-theme', 'light');

    await user.click(radio(dialog(), 'System'));

    expect(root).not.toHaveAttribute('data-theme');
  });

  it('saves the units, gauge style, theme and paint, and restores them on the next visit', async () => {
    const user = userEvent.setup();
    const first = renderWithTiles();

    expect(localStorage.getItem('cuxGauge.preferences')).toBeNull();

    await openPreferences(user);
    await user.click(radio(dialog(), 'Celsius (°C)'));
    await user.click(radio(dialog(), 'Kilometres per hour (km/h)'));
    await user.click(radio(dialog(), 'Dials'));
    await user.click(within(dialog()).getByRole('tab', { name: 'Appearance' }));
    await user.click(radio(dialog(), 'Dark'));
    await user.click(radio(dialog(), 'Arles Blue'));

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

    await openPreferences(user);

    expect(radio(dialog(), 'Celsius (°C)')).toBeChecked();
    expect(radio(dialog(), 'Kilometres per hour (km/h)')).toBeChecked();
    expect(radio(dialog(), 'Dials')).toBeChecked();

    await user.click(within(dialog()).getByRole('tab', { name: 'Appearance' }));

    expect(radio(dialog(), 'Dark')).toBeChecked();
    expect(radio(dialog(), 'Arles Blue')).toBeChecked();
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

    await openPreferences(user, 'Appearance');
    await user.click(radio(dialog(), 'Arles Blue'));

    expect(root).toHaveAttribute('data-palette', 'arles');

    await user.click(radio(dialog(), 'Alpine White and Beluga Black'));

    expect(root).toHaveAttribute('data-palette', 'alpine-beluga');

    await user.click(radio(dialog(), 'British Racing Green'));

    expect(root).toHaveAttribute('data-palette', 'racing-green');
    expect(radio(dialog(), 'British Racing Green')).toBeChecked();

    await user.click(radio(dialog(), 'Coniston Green'));

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

    await openPreferences(user, 'Appearance');

    expect(radio(dialog(), 'Coniston Green')).toBeChecked();
  });

  it('offers the usage-counts choice where the app counts usage', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <TestPlatform platform={browserPlatform()}>
          <PreferencesProvider>
            <Preferences offerUsageCounts />
          </PreferencesProvider>
        </TestPlatform>
      </MemoryRouter>,
    );
    await openPreferences(user);

    const group = within(dialog()).getByRole('radiogroup', {
      name: 'Usage counts',
    });

    expect(radio(group, 'Count my visits anonymously')).toBeChecked();

    await user.click(radio(group, 'Don’t count my visits'));

    expect(
      JSON.parse(localStorage.getItem('cuxGauge.preferences') ?? 'null'),
    ).toMatchObject({ usageCounts: 'off' });
    await expectNoAxeViolations(dialog());
  });

  it('does not offer usage counts where the app does not count usage', async () => {
    const user = userEvent.setup();

    renderWithTiles();
    await openPreferences(user);

    expect(
      within(dialog()).queryByRole('radiogroup', { name: 'Usage counts' }),
    ).not.toBeInTheDocument();
  });

  it('has no detectable accessibility violations, closed or in any section', async () => {
    const user = userEvent.setup();

    renderWithTiles();
    await expectNoAxeViolations(document.body);

    for (const section of ['General', 'Appearance', 'Limits'] as const) {
      await openPreferences(user, section);
      await expectNoAxeViolations(dialog());
      await closePreferences(user);
    }
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
      <MemoryRouter>
        <TestPlatform
          platform={browserPlatform({
            screen: { ...base, wakeLock: awake },
          })}
        >
          <PreferencesProvider>
            <Preferences />
          </PreferencesProvider>
        </TestPlatform>
      </MemoryRouter>,
    );
    await openPreferences(user);

    const box = within(dialog()).getByRole('checkbox', {
      name: 'Keep the screen on while connected',
    });

    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();

    await user.click(box);

    expect(box).toBeChecked();
    expect(
      JSON.parse(localStorage.getItem('cuxGauge.preferences') ?? 'null'),
    ).toMatchObject({ keepScreenOn: true });
  });

  it('says keeping the screen on is not supported, and cannot be chosen, without a wake lock', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <TestPlatform platform={testPlatform()}>
          <PreferencesProvider>
            <Preferences />
          </PreferencesProvider>
        </TestPlatform>
      </MemoryRouter>,
    );
    await openPreferences(user);

    const box = within(dialog()).getByRole('checkbox', {
      name: 'Keep the screen on while connected',
    });

    expect(box).toBeDisabled();
    expect(box).toHaveAccessibleDescription('Not supported in this browser.');
  });
});
