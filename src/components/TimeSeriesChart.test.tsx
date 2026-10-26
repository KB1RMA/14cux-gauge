// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Gear } from '@kb1rma/libcomm14cux-ts';
import { HistoryContext } from '../ecu/contexts';
import { SampleHistory } from '../history/sampleHistory';
import { METRIC_KEYS, METRICS, type MetricKey } from '../metrics';
import { browserPlatform } from '../platform/browser';
import { TestPlatform } from '../test-support/TestApp';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { expectNoAxeViolations } from '../test-support/a11y';
import { loadPlot } from '../charts/plotOptions';
import { installCanvasStandIns } from '../test-support/canvas';
import type { GraphWindow } from '../settings/graphSettings';
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
  timeWindow: GraphWindow = 60,
) {
  const result = render(
    <TestPlatform platform={browserPlatform()}>
      <PreferencesProvider>
        <HistoryContext value={history}>
          <TimeSeriesChart metric={metric(key)} timeWindow={timeWindow} />
        </HistoryContext>
      </PreferencesProvider>
    </TestPlatform>,
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
  it('lists the limits that apply beside the graph, in the chosen units', () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(1000, { coolantTempF: 212 });

    const { unmount } = renderChart('coolantTempF', history);
    const figure = screen.getByRole('figure', { name: 'Coolant (°F)' });

    expect(stat(figure, 'Limits')).toBe('hot ≥ 221 °F, overheating ≥ 239 °F');

    unmount();
    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ temperatureUnit: 'C' }),
    );
    renderChart('coolantTempF', history);

    expect(
      stat(screen.getByRole('figure', { name: 'Coolant (°C)' }), 'Limits'),
    ).toBe('hot ≥ 105 °C, overheating ≥ 115 °C');
  });

  it('lists no limits for a reading without any', () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(1000, { throttle: 0.5, gear: Gear.DriveOrReverse });
    renderChart('throttle', history);

    expect(
      stat(screen.getByRole('figure', { name: 'Throttle (%)' }), 'Limits'),
    ).toBeNull();
  });

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

  it('summarises the whole session in the session window', () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { throttle: 0.9 });
    history.push(3_600_000, { throttle: 0.1 });
    history.push(7_200_000, { throttle: 0.2 });
    renderChart('throttle', history, 'session');

    const figure = screen.getByRole('figure', { name: 'Throttle (%)' });

    expect(stat(figure, 'Now')).toBe('20 %');
    expect(stat(figure, 'Max')).toBe('90 %');
    expect(stat(figure, 'Min')).toBe('10 %');
  });

  it('keeps a one-sample spike in a long session', () => {
    const history = new SampleHistory(METRIC_KEYS, 10_000);

    // An hour at one sample a second, thinned to a few per bucket.
    for (let i = 0; i < 3600; i++) {
      history.push(i * 1000, { engineRpm: i === 1234 ? 412 : 800 });
    }

    renderChart('engineRpm', history, 'session');

    const figure = screen.getByRole('figure', { name: 'Engine speed (rpm)' });

    expect(stat(figure, 'Min')).toBe('412 rpm');
    expect(stat(figure, 'Max')).toBe('800 rpm');
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

  // The chart library is imported on first use. Import it once here, so no
  // test's wait for a chart includes that (slow, on a CI runner) first load.
  // It reads matchMedia as it loads, so the stand-ins must be in place.
  beforeAll(async () => {
    const restoreForImport = installCanvasStandIns();

    await loadPlot();
    restoreForImport();
  });

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

    await waitFor(() => {
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

  it('resizes the chart with its container', async () => {
    const observers: (() => void)[] = [];

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }

        observe(): void {}
        disconnect(): void {}
      },
    );

    const { container } = renderChart('engineRpm');

    await waitFor(() => {
      expect(observers).toHaveLength(1);
    });

    expect(() => {
      observers[0]?.();
    }).not.toThrow();
    expect(container.querySelector('.uplot')).not.toBeNull();
  });

  it('refits the chart when the page is printed', async () => {
    const listeners: (() => void)[] = [];

    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (_type: string, listener: () => void) => {
        listeners.push(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.splice(listeners.indexOf(listener), 1);
      },
    }));

    const { container, unmount } = renderChart('engineRpm');

    await vi.waitFor(() => {
      expect(listeners).toHaveLength(1);
    });

    expect(() => {
      listeners[0]?.();
    }).not.toThrow();
    expect(container.querySelector('.uplot')).not.toBeNull();

    unmount();

    expect(listeners).toHaveLength(0);
  });

  it('draws the session window', async () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { engineRpm: 750 });

    const { container } = renderChart('engineRpm', history, 'session');

    await vi.waitFor(() => {
      expect(container.querySelector('canvas')).not.toBeNull();
    });

    act(() => {
      history.push(120_000, { engineRpm: 800 });
    });

    expect(container.querySelector('.uplot')).not.toBeNull();
  });

  it('draws on/off readings as steps', async () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { milOn: 0 });
    history.push(1000, { milOn: 1 });

    const { container } = renderChart('milOn', history);

    await waitFor(() => {
      expect(container.querySelector('canvas')).not.toBeNull();
    });
  });

  /** The plot area of the `index`th chart, once it is drawn. */
  async function plotArea(container: HTMLElement, index = 0) {
    // uPlot's plot area has no role; it is hidden from assistive tech.
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.u-over').length).toBeGreaterThan(
        index,
      );
    });

    const over = container.querySelectorAll<HTMLElement>('.u-over')[index];

    if (!over) {
      throw new Error(`No plot ${String(index)}`);
    }

    return over;
  }

  /** Moves the pointer over the plot, `x` pixels from its left edge. */
  function hover(over: HTMLElement, x: number) {
    fireEvent.mouseMove(over, { clientX: x, clientY: 50 });
  }

  it('shows the time and value of the sample nearest the pointer', async () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    // 60 s across the plot: these are 30 s before the newest, and the newest.
    history.push(0, { engineRpm: 750 });
    history.push(30_000, { engineRpm: 1500 });

    const { container } = renderChart('engineRpm', history);
    const figure = screen.getByRole('figure', { name: 'Engine speed (rpm)' });
    const over = await plotArea(container);

    // Near the left edge, 50 s back: the nearest sample is the one 30 s back.
    hover(over, 10);

    const readout = await within(figure).findByText('−0:30.0 · 750 rpm');

    expect(readout).toBeVisible();

    // At the right edge: the newest sample.
    hover(over, over.clientWidth - 1);

    expect(readout).toHaveTextContent(/^now · 1500 rpm$/);

    fireEvent.mouseLeave(over);

    await vi.waitFor(() => {
      expect(readout).not.toBeVisible();
    });
  });

  it('follows new samples under a still pointer', async () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { engineRpm: 750 });

    const { container } = renderChart('engineRpm', history);
    const figure = screen.getByRole('figure', { name: 'Engine speed (rpm)' });
    const over = await plotArea(container);

    hover(over, over.clientWidth - 1);

    const readout = await within(figure).findByText('now · 750 rpm');

    act(() => {
      history.push(400, { engineRpm: 812 });
    });

    await vi.waitFor(() => {
      expect(readout).toHaveTextContent(/^now · 812 rpm$/);
    });
  });

  it('reads "No reading" over a gap, never 0', async () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    // 60 s, 31 s and 0 s before the newest; the middle one is invalid.
    history.push(0, { mainVoltage: 14.2 });
    history.push(29_000, { mainVoltage: null });
    history.push(60_000, { mainVoltage: 14.04 });

    const { container } = renderChart('mainVoltage', history);
    const figure = screen.getByRole('figure', { name: 'Main voltage (V)' });
    const over = await plotArea(container);

    // Halfway across: 30 s back, nearest the invalid sample.
    hover(over, over.clientWidth / 2);

    expect(
      await within(figure).findByText('−0:31.0 · No reading'),
    ).toBeVisible();

    hover(over, over.clientWidth - 1);

    expect(await within(figure).findByText('now · 14.0 V')).toBeVisible();
  });

  it('reads in the chosen units', async () => {
    localStorage.setItem(
      'cuxGauge.preferences',
      JSON.stringify({ temperatureUnit: 'C' }),
    );

    const history = new SampleHistory(METRIC_KEYS, 100);

    // 212 °F is 100 °C.
    history.push(0, { coolantTempF: 212 });

    const { container } = renderChart('coolantTempF', history);
    const figure = screen.getByRole('figure', { name: 'Coolant (°C)' });
    const over = await plotArea(container);

    hover(over, over.clientWidth - 1);

    expect(await within(figure).findByText('now · 100 °C')).toBeVisible();
  });

  it('shares the crosshair with the other graphs', async () => {
    const history = new SampleHistory(METRIC_KEYS, 100);

    history.push(0, { engineRpm: 750, throttle: 0.5 });

    const { container } = render(
      <TestPlatform platform={browserPlatform()}>
        <PreferencesProvider>
          <HistoryContext value={history}>
            <TimeSeriesChart
              metric={metric('engineRpm')}
              timeWindow={60}
              syncKey="live"
            />
            <TimeSeriesChart
              metric={metric('throttle')}
              timeWindow={60}
              syncKey="live"
            />
          </HistoryContext>
        </PreferencesProvider>
      </TestPlatform>,
    );

    await plotArea(container, 1);
    hover(await plotArea(container, 0), 300);

    const throttle = screen.getByRole('figure', { name: /^Throttle/ });

    expect(await within(throttle).findByText(/^now · \S+ %$/)).toBeVisible();
  });

  it('does not build a chart if unmounted before the library loads', async () => {
    const { container, unmount } = renderChart('engineRpm');

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(container.querySelector('canvas')).toBeNull();
  });
});
