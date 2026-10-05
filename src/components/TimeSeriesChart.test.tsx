// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, screen, within } from '@testing-library/react';
import { Gear } from 'comm14cux-ts';
import { HistoryContext } from '../ecu/contexts';
import { SampleHistory } from '../history/sampleHistory';
import { METRIC_KEYS, METRICS, type MetricKey } from '../metrics';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations } from '../test-support/a11y';
import { installCanvasStandIns } from '../test-support/canvas';
import { TimeSeriesChart } from './TimeSeriesChart';

function metric(key: MetricKey) {
  const found = METRICS.find((m) => m.key === key);

  if (!found) {
    throw new Error(`No metric ${key}`);
  }

  return found;
}

function renderChart(
  key: MetricKey,
  history = new SampleHistory(METRIC_KEYS, 100),
  windowSeconds = 60,
) {
  const result = render(
    <PreferencesProvider>
      <HistoryContext value={history}>
        <TimeSeriesChart metric={metric(key)} windowSeconds={windowSeconds} />
      </HistoryContext>
    </PreferencesProvider>,
  );

  return { ...result, history };
}

/** The text shown for one statistic ("Now", "Min", "Max") of a graph. */
function stat(figure: HTMLElement, term: string): string | null {
  const dt = within(figure)
    .getAllByRole('term')
    .find((element) => element.textContent === term);

  return dt?.nextElementSibling?.textContent ?? null;
}

describe('TimeSeriesChart', () => {
  it('is a figure named after the metric, with its latest, lowest and highest values', () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(1000, { engineRpm: 750 });
    history.push(2000, { engineRpm: 3000 });
    history.push(3000, { engineRpm: 1500 });
    renderChart('engineRpm', history);

    const figure = screen.getByRole('figure', { name: 'Engine speed (rpm)' });

    expect(stat(figure, 'Now')).toBe('1500 rpm');
    expect(stat(figure, 'Min')).toBe('750 rpm');
    expect(stat(figure, 'Max')).toBe('3000 rpm');
  });

  it('updates as samples arrive, in the chosen units', () => {
    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ temperatureUnit: 'C' }),
    );

    const { history } = renderChart('coolantTempF');
    const figure = screen.getByRole('figure', { name: 'Coolant (°C)' });

    expect(stat(figure, 'Now')).toBe('—No data yet');

    act(() => {
      history.push(0, { coolantTempF: 212 });
    });

    expect(stat(figure, 'Now')).toBe('100 °C');
  });

  it('only summarises samples inside the time window', () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { throttle: 0.9 });
    history.push(40_000, { throttle: 0.1 });
    history.push(60_000, { throttle: 0.2 });
    renderChart('throttle', history, 30);

    const figure = screen.getByRole('figure', { name: 'Throttle (%)' });

    expect(stat(figure, 'Max')).toBe('20 %');
    expect(stat(figure, 'Min')).toBe('10 %');
  });

  it('says when the latest reading is invalid', () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { mainVoltage: 14.2 });
    history.push(100, { mainVoltage: null });
    renderChart('mainVoltage', history);

    const figure = screen.getByRole('figure', { name: 'Main voltage (V)' });

    expect(stat(figure, 'Now')).toBe('—No valid reading');
    expect(stat(figure, 'Max')).toBe('14.2 V');
  });

  it('shows only the current state for on/off and gear readings', () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { gear: Gear.DriveOrReverse, milOn: 1 });
    renderChart('gear', history);

    const figure = screen.getByRole('figure', { name: 'Gear' });

    expect(stat(figure, 'Now')).toBe('D / R');
    expect(stat(figure, 'Min')).toBeNull();
  });

  it('hides the canvas from assistive tech', async () => {
    const { container } = renderChart('engineRpm');

    // The plot area is decoration; its figure's text carries the values.
    expect(
      container.querySelector('[aria-hidden="true"]:empty'),
    ).not.toBeNull();
    await expectNoAxeViolations(container);
  });
});

describe('TimeSeriesChart drawing', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = installCanvasStandIns();
  });

  afterEach(() => {
    restore();
  });

  it('draws the history into a chart, and removes it when unmounted', async () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { engineRpm: 750 });

    const { container, unmount } = renderChart('engineRpm', history);

    await vi.waitFor(() => {
      expect(container.querySelector('canvas')).not.toBeNull();
    });

    act(() => {
      history.push(1000, { engineRpm: 800 });
    });

    expect(container.querySelector('.uplot')).not.toBeNull();
    await expectNoAxeViolations(container);
    unmount();

    expect(container.querySelector('canvas')).toBeNull();
  });

  it('draws on/off readings as steps', async () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { milOn: 0 });
    history.push(1000, { milOn: 1 });

    const { container } = renderChart('milOn', history);

    await vi.waitFor(() => {
      expect(container.querySelector('canvas')).not.toBeNull();
    });
  });

  it('does not build a chart if unmounted before the library loads', async () => {
    const { container, unmount } = renderChart('engineRpm');

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(container.querySelector('canvas')).toBeNull();
  });
});
