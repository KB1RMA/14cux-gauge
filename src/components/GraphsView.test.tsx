// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryContext } from '../ecu/contexts';
import { SampleHistory } from '../history/sampleHistory';
import { METRIC_KEYS } from '../metrics';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations } from '../test-support/a11y';
import { GraphsView } from './GraphsView';

function renderGraphs() {
  return render(
    <PreferencesProvider>
      <HistoryContext value={new SampleHistory(METRIC_KEYS, 100)}>
        <GraphsView />
      </HistoryContext>
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

describe('GraphsView', () => {
  it('shows a graph for every metric, grouped like the readings', () => {
    renderGraphs();

    expect(screen.getAllByRole('figure')).toHaveLength(15);
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'Engine',
      'Airflow and throttle',
      'Electrics and fuelling',
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

  it('hides and shows graphs from the Choose graphs popover, and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = renderGraphs();
    const trigger = screen.getByRole('button', { name: /Choose graphs/ });

    await user.click(trigger);

    const picker = screen.getByRole('dialog', { name: 'Graphs to show' });
    const engine = within(picker).getByRole('group', { name: 'Engine' });

    expect(
      within(engine).getByRole('checkbox', { name: 'Engine speed' }),
    ).toBeChecked();

    await user.click(
      within(engine).getByRole('checkbox', { name: 'Engine speed' }),
    );
    // The label toggles its checkbox too.
    await user.click(within(picker).getByText('Gear'));

    expect(
      within(engine).getByRole('checkbox', { name: 'Engine speed' }),
    ).not.toBeChecked();
    expect(screen.getAllByRole('figure')).toHaveLength(13);
    expect(figureNames()).not.toContain('Engine speed (rpm)');
    expect(trigger).toHaveTextContent('13 of 15');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    unmount();
    renderGraphs();

    expect(screen.getAllByRole('figure')).toHaveLength(13);
    expect(storedGraphs()).toEqual({
      windowSeconds: 60,
      hidden: ['engineRpm', 'gear'],
    });

    await user.click(screen.getByRole('button', { name: /Choose graphs/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Engine speed' }));

    expect(screen.getAllByRole('figure')).toHaveLength(14);
  });

  it('hides every graph, says so, and shows them all again', async () => {
    const user = userEvent.setup();

    renderGraphs();
    await user.click(screen.getByRole('button', { name: /Choose graphs/ }));
    await user.click(screen.getByRole('button', { name: 'Hide all' }));

    expect(screen.getByRole('button', { name: 'Hide all' })).toBeDisabled();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.getByText(/No graphs are shown/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all' }));

    expect(screen.getByRole('button', { name: 'Show all' })).toBeDisabled();
    expect(screen.getAllByRole('figure')).toHaveLength(15);
  });

  it('ignores stored settings it does not recognise', () => {
    localStorage.setItem(
      'cuxGauge.graphs',
      JSON.stringify({ windowSeconds: 45, hidden: ['nonsense', 'airflow'] }),
    );

    renderGraphs();

    expect(screen.getByRole('radio', { name: '1 minute' })).toBeChecked();
    expect(screen.getAllByRole('figure')).toHaveLength(14);
  });

  it('has no detectable accessibility violations, with the picker closed or open', async () => {
    const user = userEvent.setup();

    renderGraphs();
    await expectNoAxeViolations(document.body);
    await user.click(screen.getByRole('button', { name: /Choose graphs/ }));
    await expectNoAxeViolations(document.body);
  });
});
