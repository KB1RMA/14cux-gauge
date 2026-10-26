// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { LiveStatus } from '../ecu/liveStatus';
import type { LiveSnapshot } from '../model/snapshot';
import { browserPlatform } from '../platform/browser';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations, readingFor } from '../test-support/a11y';
import { TestPlatform } from '../test-support/TestApp';
import { SnapshotDash } from './DashView';
import { Preferences } from './Preferences';

const LIVE: LiveStatus = { live: true };

const KEYS = ['coolantTempF', 'mainVoltage', 'engineRpm', 'milOn'] as const;

const SNAPSHOT: LiveSnapshot = {
  timestamp: 0,
  coolantTempF: 212,
  mainVoltage: 13.8,
  engineRpm: 750,
  milOn: false,
};

/** Preferences and the dash, whose readings follow the limits that apply. */
function renderApp(snapshot: LiveSnapshot = SNAPSHOT) {
  const ui = (shown: LiveSnapshot) => (
    <MemoryRouter initialEntries={['/dash']}>
      <TestPlatform platform={browserPlatform()}>
        <PreferencesProvider>
          <Preferences />
          <SnapshotDash keys={KEYS} snapshot={shown} status={LIVE} />
        </PreferencesProvider>
      </TestPlatform>
    </MemoryRouter>
  );
  const result = render(ui(snapshot));

  return {
    ...result,
    show: (shown: LiveSnapshot) => {
      result.rerender(ui(shown));
    },
  };
}

/** Opens Preferences at Limits, as the user does from the app bar. */
async function openLimits(user: UserEvent): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: 'Preferences' }));

  const dialog = screen.getByRole('dialog', { name: 'Preferences' });

  await user.click(within(dialog).getByRole('tab', { name: 'Limits' }));

  return dialog;
}

/** Closes Preferences, so the readings behind it can be read again. */
async function close(user: UserEvent, dialog: HTMLElement) {
  await user.click(
    within(dialog).getByRole('button', { name: 'Close preferences' }),
  );
}

function reading(dialog: HTMLElement, name: RegExp): HTMLElement {
  return within(dialog).getByRole('group', { name });
}

function field(group: HTMLElement, label: string): HTMLInputElement {
  return within(group).getByRole<HTMLInputElement>('textbox', {
    name: label,
  });
}

/** Types `value` into a field, replacing what it held, and stays in it. */
async function type(
  user: UserEvent,
  group: HTMLElement,
  label: string,
  value: string,
) {
  await user.clear(field(group, label));

  if (value !== '') {
    await user.type(field(group, label), value);
  }
}

/** Types `value` into a field and leaves it, which applies the reading. */
async function setField(
  user: UserEvent,
  group: HTMLElement,
  label: string,
  value: string,
) {
  await type(user, group, label, value);
  await user.tab();
}

describe('LimitsPreferences', () => {
  it('shows the suggested limits in the chosen units', async () => {
    const user = userEvent.setup();

    renderApp();

    const dialog = await openLimits(user);
    const coolant = reading(dialog, /^Coolant/);

    expect(coolant).toHaveAccessibleName('Coolant (°F)');
    expect(field(coolant, 'Very low')).toHaveValue('');
    expect(field(coolant, 'Low')).toHaveValue('');
    expect(field(coolant, 'High')).toHaveValue('221');
    expect(field(coolant, 'Very high')).toHaveValue('239');
    expect(within(coolant).getByText('Suggested limits.')).toBeInTheDocument();

    const voltage = reading(dialog, /^Main voltage/);

    expect(field(voltage, 'Very low')).toHaveValue('11.0');
    expect(field(voltage, 'Low')).toHaveValue('12.0');
    expect(field(voltage, 'High')).toHaveValue('14.8');
    expect(field(voltage, 'Very high')).toHaveValue('15.5');

    const throttle = reading(dialog, /^Throttle/);

    expect(throttle).toHaveAccessibleName('Throttle (%)');
    expect(within(throttle).getByText('No limits set.')).toBeInTheDocument();
    expect(field(throttle, 'High')).toHaveValue('');
    // States and map positions take no limits.
    expect(
      within(dialog).queryByRole('group', { name: /^MIL/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('group', { name: /^Fuel map/ }),
    ).not.toBeInTheDocument();
    await expectNoAxeViolations(dialog);
  });

  it('marks a live reading against the suggested limits until the user sets their own', async () => {
    const user = userEvent.setup();
    const { show } = renderApp({ ...SNAPSHOT, coolantTempF: 221 });

    expect(readingFor('Coolant')).toHaveTextContent(/^221 °F hot$/);

    show({ ...SNAPSHOT, coolantTempF: 220.9 });

    expect(readingFor('Coolant')).toHaveTextContent(/^221 °F$/);

    const dialog = await openLimits(user);
    const coolant = reading(dialog, /^Coolant/);

    await setField(user, coolant, 'High', '200');
    await setField(user, coolant, 'Very high', '220');

    // Applied as each field is left; the dialog stays open.
    expect(
      within(coolant).getByText(
        'Your limits. Suggested: hot ≥ 221 °F, overheating ≥ 239 °F.',
      ),
    ).toBeInTheDocument();

    await close(user, dialog);

    expect(readingFor('Coolant')).toHaveTextContent(/^221 °F overheating$/);

    show({ ...SNAPSHOT, coolantTempF: 199.9 });

    expect(readingFor('Coolant')).toHaveTextContent(/^200 °F$/);

    show({ ...SNAPSHOT, coolantTempF: 200 });

    expect(readingFor('Coolant')).toHaveTextContent(/^200 °F hot$/);
  });

  it('applies a reading on Enter as well', async () => {
    const user = userEvent.setup();

    renderApp({ ...SNAPSHOT, coolantTempF: 212 });

    const dialog = await openLimits(user);
    const coolant = reading(dialog, /^Coolant/);

    await type(user, coolant, 'High', '212');
    await user.keyboard('{Enter}');

    expect(field(coolant, 'High')).toHaveFocus();

    await close(user, dialog);

    expect(readingFor('Coolant')).toHaveTextContent(/^212 °F hot$/);
  });

  it('applies what was typed when Preferences closes or the section changes', async () => {
    const user = userEvent.setup();

    renderApp({ ...SNAPSHOT, coolantTempF: 212 });

    let dialog = await openLimits(user);

    await type(user, reading(dialog, /^Coolant/), 'High', '212');
    await user.keyboard('{Escape}');

    expect(readingFor('Coolant')).toHaveTextContent(/^212 °F hot$/);

    dialog = await openLimits(user);
    await type(user, reading(dialog, /^Coolant/), 'Very high', '212');
    await user.click(within(dialog).getByRole('tab', { name: 'General' }));
    await close(user, dialog);

    expect(readingFor('Coolant')).toHaveTextContent(/^212 °F overheating$/);
  });

  it('takes limits in °C and compares them with the sample in °F', async () => {
    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ temperatureUnit: 'C' }),
    );

    const user = userEvent.setup();
    const { show } = renderApp();
    const dialog = await openLimits(user);
    const coolant = reading(dialog, /^Coolant/);

    expect(coolant).toHaveAccessibleName('Coolant (°C)');
    expect(field(coolant, 'High')).toHaveValue('105');
    expect(field(coolant, 'Very high')).toHaveValue('115');

    // 100 °C is 212 °F.
    await setField(user, coolant, 'High', '100');
    await close(user, dialog);

    expect(readingFor('Coolant')).toHaveTextContent(/^100 °C hot$/);

    // 211.9 °F is 99.94 °C, shown as 100 °C but below the limit.
    show({ ...SNAPSHOT, coolantTempF: 211.9 });

    expect(readingFor('Coolant')).toHaveTextContent(/^100 °C$/);
  });

  it('flags low limits at and below their value', async () => {
    const user = userEvent.setup();
    const { show } = renderApp({ ...SNAPSHOT, mainVoltage: 12 });

    expect(readingFor('Main voltage')).toHaveTextContent(/^12\.0 V low$/);

    show({ ...SNAPSHOT, mainVoltage: 12.05 });

    expect(readingFor('Main voltage')).toHaveTextContent(/^12\.1 V$/);

    show({ ...SNAPSHOT, mainVoltage: 11 });

    expect(readingFor('Main voltage')).toHaveTextContent(/^11\.0 V very low$/);

    const dialog = await openLimits(user);
    const voltage = reading(dialog, /^Main voltage/);

    await setField(user, voltage, 'Very low', '');
    await setField(user, voltage, 'Low', '');
    await close(user, dialog);

    expect(readingFor('Main voltage')).toHaveTextContent(/^11\.0 V$/);
  });

  it('never flags an invalid reading', () => {
    renderApp({ timestamp: 0, coolantTempF: null, mainVoltage: null });

    expect(readingFor('Coolant')).toHaveTextContent(/^—No valid reading$/);
    expect(readingFor('Main voltage')).toHaveTextContent(/^—No valid reading$/);
  });

  it('turns every level of a reading off when they are cleared', async () => {
    const user = userEvent.setup();

    renderApp({ ...SNAPSHOT, coolantTempF: 300 });

    const dialog = await openLimits(user);
    const coolant = reading(dialog, /^Coolant/);

    await setField(user, coolant, 'High', '');
    await setField(user, coolant, 'Very high', '');
    await close(user, dialog);

    expect(readingFor('Coolant')).toHaveTextContent(/^300 °F$/);

    const reopened = reading(await openLimits(user), /^Coolant/);

    expect(field(reopened, 'High')).toHaveValue('');
    expect(field(reopened, 'Very high')).toHaveValue('');
  });

  it('goes back to the suggested limits on request', async () => {
    const user = userEvent.setup();

    renderApp({ ...SNAPSHOT, coolantTempF: 230 });

    const dialog = await openLimits(user);
    const coolant = reading(dialog, /^Coolant/);

    expect(
      within(coolant).queryByRole('button', { name: 'Use suggested limits' }),
    ).not.toBeInTheDocument();

    await setField(user, coolant, 'High', '235');
    await user.click(
      within(coolant).getByRole('button', { name: 'Use suggested limits' }),
    );

    expect(field(coolant, 'High')).toHaveValue('221');
    expect(field(coolant, 'Very high')).toHaveValue('239');
    expect(within(coolant).getByText('Suggested limits.')).toBeInTheDocument();

    await close(user, dialog);

    expect(readingFor('Coolant')).toHaveTextContent(/^230 °F hot$/);
  });

  it('refuses a limit that is not a number, says why beside the field, and keeps the limits that applied', async () => {
    const user = userEvent.setup();

    renderApp({ ...SNAPSHOT, coolantTempF: 230 });

    const dialog = await openLimits(user);
    const coolant = reading(dialog, /^Coolant/);

    await setField(user, coolant, 'High', 'hot');

    expect(field(coolant, 'High')).toBeInvalid();
    expect(field(coolant, 'High')).toHaveAccessibleDescription(
      'High: enter a number.',
    );
    expect(within(coolant).getByRole('alert')).toHaveTextContent(
      'High: enter a number.',
    );
    await expectNoAxeViolations(dialog);

    await close(user, dialog);

    expect(readingFor('Coolant')).toHaveTextContent(/^230 °F hot$/);
  });

  it('refuses more decimals than the reading shows', async () => {
    const user = userEvent.setup();

    renderApp();

    const dialog = await openLimits(user);
    const voltage = reading(dialog, /^Main voltage/);

    await setField(user, voltage, 'Low', '11.85');

    expect(field(voltage, 'Low')).toHaveAccessibleDescription(
      'Low: enter it as the reading shows it, such as 11.8.',
    );

    await setField(user, voltage, 'Low', '11.9');

    expect(field(voltage, 'Low')).toBeValid();
    expect(within(voltage).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses levels out of order, and a high level at a low one', async () => {
    const user = userEvent.setup();

    renderApp();

    const dialog = await openLimits(user);
    const voltage = reading(dialog, /^Main voltage/);
    const order =
      'Each level must be above the one before it: very low, low, high, very high.';

    await setField(user, voltage, 'Very low', '12.5');

    expect(field(voltage, 'Low')).toHaveAccessibleDescription(order);

    await setField(user, voltage, 'Very low', '');
    await setField(user, voltage, 'High', '12.0');

    expect(field(voltage, 'High')).toHaveAccessibleDescription(order);

    // Levels on one side may meet.
    await setField(user, voltage, 'High', '15.5');

    expect(within(voltage).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a level the user did not change at full precision in any units', async () => {
    const user = userEvent.setup();

    renderApp();

    // 220 °F, set in °F, shows as 104 °C (104.44 °C).
    let dialog = await openLimits(user);

    await setField(user, reading(dialog, /^Coolant/), 'High', '220');
    await user.click(within(dialog).getByRole('tab', { name: 'General' }));
    await user.click(
      within(dialog).getByRole('radio', { name: 'Celsius (°C)' }),
    );
    await user.click(within(dialog).getByRole('tab', { name: 'Limits' }));

    const coolant = reading(dialog, /^Coolant/);

    expect(field(coolant, 'High')).toHaveValue('104');

    // Leaving the field unchanged applies nothing new.
    await user.click(field(coolant, 'High'));
    await user.tab();
    await close(user, dialog);
    dialog = await openLimits(user);
    await user.click(within(dialog).getByRole('tab', { name: 'General' }));
    await user.click(
      within(dialog).getByRole('radio', { name: 'Fahrenheit (°F)' }),
    );
    await user.click(within(dialog).getByRole('tab', { name: 'Limits' }));

    // Still 220 °F, not 104 °C (219.2 °F).
    expect(field(reading(dialog, /^Coolant/), 'High')).toHaveValue('220');
  });
});
