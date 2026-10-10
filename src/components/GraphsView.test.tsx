// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryContext } from '../ecu/contexts';
import { SampleHistory } from '../history/sampleHistory';
import { METRIC_KEYS } from '../metrics';
import { browserPlatform } from '../platform/browser';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { ReadingsProvider } from '../readings/ReadingsProvider';
import { expectNoAxeViolations } from '../test-support/a11y';
import { TestServices } from '../test-support/TestApp';
import { GraphsView } from './GraphsView';

function renderGraphs() {
  return render(
    <TestServices platform={browserPlatform()}>
      <PreferencesProvider>
        <ReadingsProvider>
          <GraphsView />
        </ReadingsProvider>
      </PreferencesProvider>
    </TestServices>,
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

    expect(screen.getAllByRole('figure')).toHaveLength(25);
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
    expect(storedGraphs()).toEqual({
      window: 300,
      layout: 'grid',
      hidden: [],
    });

    unmount();
    renderGraphs();

    expect(screen.getByRole('radio', { name: '5 minutes' })).toBeChecked();
  });

  it('puts the controls in one toolbar', () => {
    renderGraphs();

    const toolbar = screen.getByRole('toolbar', { name: 'Graph options' });

    expect(
      within(toolbar).getByRole('radiogroup', { name: 'Time window' }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('radiogroup', { name: 'Layout' }),
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: /Choose readings/ }),
    ).toBeInTheDocument();
  });

  it('shows the whole session, and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderGraphs();

    await user.click(screen.getByRole('radio', { name: 'Whole session' }));

    expect(screen.getByRole('radio', { name: 'Whole session' })).toBeChecked();
    expect(storedGraphs()).toMatchObject({ window: 'session' });

    unmount();
    renderGraphs();

    expect(screen.getByRole('radio', { name: 'Whole session' })).toBeChecked();
  });

  it('says when the session window has lost its oldest samples', () => {
    const history = new SampleHistory(METRIC_KEYS, 3);

    localStorage.setItem(
      'cuxGauge.graphs',
      JSON.stringify({ window: 'session' }),
    );

    for (let i = 0; i <= 3; i++) {
      history.push(i * 60_000, { engineRpm: 800 });
    }

    render(
      <TestServices platform={browserPlatform()}>
        <PreferencesProvider>
          <ReadingsProvider>
            <HistoryContext value={history}>
              <GraphsView />
            </HistoryContext>
          </ReadingsProvider>
        </PreferencesProvider>
      </TestServices>,
    );

    expect(screen.getByText(/older ones have been dropped/)).toHaveTextContent(
      'The graphs hold a limited number of samples, so older ones have been dropped. They show the last 2:00 of the session; record the session to keep all of it.',
    );
  });

  it('does not mention dropped samples before any are dropped', () => {
    localStorage.setItem(
      'cuxGauge.graphs',
      JSON.stringify({ window: 'session' }),
    );
    renderGraphs();

    expect(screen.queryByText(/dropped/)).not.toBeInTheDocument();
  });

  it('lays the graphs out in a grid or stacked, and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = renderGraphs();
    const layout = screen.getByRole('radiogroup', { name: 'Layout' });

    expect(within(layout).getByRole('radio', { name: 'Grid' })).toBeChecked();

    await user.click(within(layout).getByRole('radio', { name: 'Stacked' }));
    // Pressing the chosen layout again keeps it chosen.
    await user.click(within(layout).getByRole('radio', { name: 'Stacked' }));

    expect(
      within(layout).getByRole('radio', { name: 'Stacked' }),
    ).toBeChecked();
    expect(storedGraphs()).toMatchObject({ layout: 'stacked' });

    unmount();
    renderGraphs();

    expect(screen.getByRole('radio', { name: 'Stacked' })).toBeChecked();
    expect(screen.getAllByRole('figure')).toHaveLength(25);
  });

  it('graphs only the chosen readings, and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = renderGraphs();
    const trigger = screen.getByRole('button', { name: /Choose readings/ });

    expect(trigger).toHaveTextContent('25 of 25');

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
    expect(screen.getAllByRole('figure')).toHaveLength(23);
    expect(figureNames()).not.toContain('Engine speed (rpm)');
    expect(trigger).toHaveTextContent('23 of 25');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    unmount();
    renderGraphs();

    expect(screen.getAllByRole('figure')).toHaveLength(23);
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

    // No quick choice matches one value.
    expect(
      within(
        screen.getByRole('radiogroup', { name: 'Quick choices' }),
      ).queryAllByRole('radio', { checked: true }),
    ).toEqual([]);

    await user.click(screen.getByRole('radio', { name: 'Idle' }));

    // The pressed quick choice is the one in use.
    expect(screen.getByRole('radio', { name: 'Idle' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked();
    expect(figureNames()).toEqual([
      'Engine speed (rpm)',
      'Target idle (rpm)',
      'Coolant (°F)',
      'Throttle (%)',
      'Idle bypass (% open)',
      'Idle control',
      'MIL',
    ]);

    await user.click(screen.getByRole('radio', { name: 'All' }));

    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getAllByRole('figure')).toHaveLength(25);
  });

  it('ignores stored settings it does not recognise', () => {
    localStorage.setItem(
      'cuxGauge.graphs',
      JSON.stringify({ window: 45, layout: 'masonry' }),
    );
    localStorage.setItem(
      'cuxGauge.readings',
      JSON.stringify({ off: ['nonsense', 'airflow', 'milOn'] }),
    );

    renderGraphs();

    expect(screen.getByRole('radio', { name: '1 minute' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Grid' })).toBeChecked();
    expect(screen.getAllByRole('figure')).toHaveLength(24);
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
