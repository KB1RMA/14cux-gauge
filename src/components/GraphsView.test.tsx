// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EcuProvider } from '../ecu/EcuProvider';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations } from '../test-support/a11y';
import { GraphsView } from './GraphsView';

function renderGraphs() {
  return render(
    <PreferencesProvider>
      <EcuProvider>
        <GraphsView />
      </EcuProvider>
    </PreferencesProvider>,
  );
}

function figureNames(): string[] {
  return screen
    .getAllByRole('figure')
    .map((figure) =>
      figure.getAttribute('aria-labelledby')
        ? (document.getElementById(figure.getAttribute('aria-labelledby') ?? '')
            ?.textContent ?? '')
        : '',
    );
}

function storedGraphs(): unknown {
  return JSON.parse(localStorage.getItem('cuxGauge.graphs') ?? 'null');
}

function storedReadings(): unknown {
  return JSON.parse(localStorage.getItem('cuxGauge.readings') ?? 'null');
}

describe('GraphsView', () => {
  it('shows a graph for every metric, grouped like the readings', () => {
    renderGraphs();

    expect(screen.getAllByRole('figure')).toHaveLength(20);
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'Engine',
      'Airflow and throttle',
      'Electrics and fuelling',
      'Fuel map position',
      'States',
    ]);
    expect(
      within(screen.getByRole('region', { name: 'Engine' })).getByRole(
        'figure',
        { name: 'Engine speed (rpm)' },
      ),
    ).toBeInTheDocument();
  });

  it('changes the time window, and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderGraphs();
    const window = screen.getByRole('radiogroup', { name: 'Time window' });

    expect(
      within(window).getByRole('radio', { name: '1 minute' }),
    ).toBeChecked();

    await user.click(within(window).getByRole('radio', { name: '5 minutes' }));
    // Pressing the chosen window again keeps it chosen.
    await user.click(within(window).getByRole('radio', { name: '5 minutes' }));

    expect(
      within(window).getByRole('radio', { name: '5 minutes' }),
    ).toBeChecked();
    expect(storedGraphs()).toEqual({ windowSeconds: 300, hidden: [] });

    unmount();
    renderGraphs();

    expect(screen.getByRole('radio', { name: '5 minutes' })).toBeChecked();
  });

  it('graphs only the chosen readings, and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = renderGraphs();
    const trigger = screen.getByRole('button', { name: /Choose readings/ });

    expect(trigger).toHaveTextContent('20 of 20');

    await user.click(trigger);

    const picker = screen.getByRole('dialog', { name: 'Readings to take' });
    const engine = within(picker).getByRole('group', { name: 'Engine' });

    expect(picker).toHaveAccessibleDescription(
      /The fewer readings you choose, the more often each is read/,
    );
    await user.click(
      within(engine).getByRole('checkbox', { name: 'Engine speed' }),
    );
    // The label toggles its checkbox too.
    await user.click(within(picker).getByText('Gear', { selector: 'label' }));

    expect(
      within(engine).getByRole('checkbox', { name: 'Engine speed' }),
    ).not.toBeChecked();
    expect(screen.getAllByRole('figure')).toHaveLength(18);
    expect(figureNames()).not.toContain('Engine speed (rpm)');
    expect(trigger).toHaveTextContent('18 of 20');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    unmount();
    renderGraphs();

    expect(screen.getAllByRole('figure')).toHaveLength(18);
    expect(storedReadings()).toEqual({ off: ['engineRpm', 'gear'] });
  });

  it('reads one value with Only, a preset, or all of them', async () => {
    const user = userEvent.setup();

    renderGraphs();
    await user.click(screen.getByRole('button', { name: /Choose readings/ }));
    await user.click(screen.getByRole('button', { name: 'Only Coolant' }));

    // The MIL is always read.
    expect(figureNames()).toEqual(['Coolant (°F)', 'MIL']);
    expect(screen.getByRole('checkbox', { name: 'MIL' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'MIL' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Idle' }));

    expect(figureNames()).toEqual([
      'Engine speed (rpm)',
      'Target idle (rpm)',
      'Coolant (°F)',
      'Throttle (%)',
      'Idle bypass (% open)',
      'Idle control',
      'MIL',
    ]);

    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByRole('button', { name: 'All' })).toBeDisabled();
    expect(screen.getAllByRole('figure')).toHaveLength(20);
  });

  it('ignores stored settings it does not recognise', () => {
    localStorage.setItem(
      'cuxGauge.graphs',
      JSON.stringify({ windowSeconds: 45 }),
    );
    localStorage.setItem(
      'cuxGauge.readings',
      JSON.stringify({ off: ['nonsense', 'airflow', 'milOn'] }),
    );

    renderGraphs();

    expect(screen.getByRole('radio', { name: '1 minute' })).toBeChecked();
    expect(screen.getAllByRole('figure')).toHaveLength(19);
    expect(figureNames()).toContain('MIL');
  });

  it('has no detectable accessibility violations, with the picker closed or open', async () => {
    const user = userEvent.setup();

    renderGraphs();
    await expectNoAxeViolations(document.body);
    await user.click(screen.getByRole('button', { name: /Choose readings/ }));
    await expectNoAxeViolations(document.body);
  });
});
