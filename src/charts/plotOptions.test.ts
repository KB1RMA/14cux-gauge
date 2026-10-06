// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type uPlot from 'uplot';
import { METRICS, type MetricKey } from '../metrics';
import { installCanvasStandIns } from '../test-support/canvas';
import {
  canPlot,
  formatAgo,
  formatTimelineTick,
  loadPlot,
  OVERVIEW_HEIGHT,
  overviewPlotOptions,
  plotOptions,
  timelinePlotOptions,
} from './plotOptions';

function metric(key: MetricKey) {
  const found = METRICS.find((m) => m.key === key);

  if (!found) {
    throw new Error(`No metric ${key}`);
  }

  return found;
}

/** What the chart passes to option callbacks; only `root` is read. */
const chart = { root: document.body } as unknown as uPlot;

type Fn = (...args: never[]) => unknown;

function call<T>(fn: unknown, ...args: unknown[]): T {
  return (fn as (...a: unknown[]) => T)(...args);
}

describe('formatAgo', () => {
  it('labels the x axis in seconds or whole minutes before now', () => {
    expect(formatAgo(0)).toBe('now');
    expect(formatAgo(0.2)).toBe('now');
    expect(formatAgo(-15)).toBe('−15 s');
    expect(formatAgo(-60)).toBe('−1 min');
    expect(formatAgo(-90)).toBe('−90 s');
    expect(formatAgo(-600)).toBe('−10 min');
  });
});

describe('formatTimelineTick', () => {
  it('labels the x axis as a clock from the start of the recording', () => {
    expect(formatTimelineTick(0, 5)).toBe('0:00');
    expect(formatTimelineTick(65, 5)).toBe('1:05');
    expect(formatTimelineTick(3723, 60)).toBe('1:02:03');
  });

  it('adds tenths when the ticks are under a second apart', () => {
    expect(formatTimelineTick(1.5, 0.5)).toBe('0:01.5');
    expect(formatTimelineTick(2, 0.5)).toBe('0:02.0');
    expect(formatTimelineTick(61.25, 0.1)).toBe('1:01.3');
  });
});

describe('canPlot', () => {
  it('is false in jsdom, which cannot draw', () => {
    expect(canPlot()).toBe(false);
  });

  it('is true with a 2D canvas, and false if the canvas throws', () => {
    const restore = installCanvasStandIns();

    expect(canPlot()).toBe(true);

    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => {
        throw new Error('no GPU');
      });

    expect(canPlot()).toBe(false);
    getContext.mockRestore();
    restore();
  });
});

describe('plotOptions', () => {
  let restore: () => void;
  let plot: typeof uPlot;

  beforeEach(async () => {
    restore = installCanvasStandIns();
    plot = await loadPlot();
    document.documentElement.style.setProperty('--accent', '#995c00');
    document.documentElement.style.setProperty('--border', '#d5d9df');
    document.documentElement.style.setProperty('--text-muted', '#5b6470');
  });

  afterEach(() => {
    restore();
    document.documentElement.removeAttribute('style');
  });

  it('fixes the x axis to the time window and labels it relative to now', () => {
    const options = plotOptions(plot, metric('engineRpm'), {
      width: 400,
      windowSeconds: 300,
    });
    const x = options.axes?.[0];

    expect(options.width).toBe(400);
    expect(options.scales?.['x']?.range).toEqual([-300, 0]);
    expect(call<string[]>(x?.values, chart, [-300, -150, 0])).toEqual([
      '−5 min',
      '−150 s',
      'now',
    ]);
  });

  it('draws in the theme colours', () => {
    const options = plotOptions(plot, metric('engineRpm'), {
      width: 400,
      windowSeconds: 60,
    });
    const y = options.axes?.[1];

    expect(call<string>(options.series[1]?.stroke, chart, 1)).toBe('#995c00');
    expect(call<string>(y?.stroke, chart, 1)).toBe('#5b6470');
    expect(call<string>(y?.grid?.stroke, chart, 1)).toBe('#d5d9df');
  });

  it('fits the y axis to the data unless the metric has a fixed range', () => {
    const rpm = plotOptions(plot, metric('engineRpm'), {
      width: 1,
      windowSeconds: 60,
    });
    const throttle = plotOptions(plot, metric('throttle'), {
      width: 1,
      windowSeconds: 60,
    });

    expect(call<number[]>(rpm.scales?.['y']?.range, chart, 742, 1102)).toEqual([
      700, 1140,
    ]);
    // Fixed ranges get a margin, so a line at 0 or 100 % is not on the edge.
    expect(throttle.scales?.['y']).toEqual({ auto: false, range: [-10, 110] });
    expect(rpm.axes?.[1]?.values).toBeUndefined();
    expect(rpm.series[1]?.paths).toBeUndefined();
  });

  it('plots states as steps, with a labelled tick for each state', () => {
    const gear = plotOptions(plot, metric('gear'), {
      width: 1,
      windowSeconds: 60,
    });
    const y = gear.axes?.[1];
    const splits = call<number[]>(y?.splits as Fn, chart, 1, -0.3, 3.3, 1, 1);

    expect(gear.series[1]?.paths).toEqual(expect.any(Function));
    expect(splits).toEqual([0, 1, 2, 3]);
    expect(call<string[]>(y?.values, chart, splits)).toEqual([
      'No reading',
      'P / N',
      'D / R',
      'Manual',
    ]);
  });

  it('puts the timeline on seconds into the recording, over the visible window', () => {
    const options = timelinePlotOptions(plot, metric('engineRpm'), {
      width: 400,
      syncKey: 'replay',
      xRange: () => [30, 90],
    });
    const x = options.axes?.[0];

    expect(call<number[]>(options.scales?.['x']?.range, chart, 0, 0)).toEqual([
      30, 90,
    ]);
    expect(call<string[]>(x?.values, chart, [30, 60, 90], 0, 70, 30)).toEqual([
      '0:30',
      '1:00',
      '1:30',
    ]);
    // A crosshair shared with the other graphs.
    expect(options.cursor).toMatchObject({
      show: true,
      sync: { key: 'replay' },
    });
    // The y axis is the live graph's.
    expect(
      call<number[]>(options.scales?.['y']?.range, chart, 742, 1102),
    ).toEqual([700, 1140]);
  });

  it('draws the overview strip over the whole recording, without a y axis', () => {
    const options = overviewPlotOptions(plot, metric('engineRpm'), {
      width: 400,
      durationSeconds: 275,
    });
    const empty = overviewPlotOptions(plot, metric('engineRpm'), {
      width: 400,
      durationSeconds: 0,
    });

    expect(options.height).toBe(OVERVIEW_HEIGHT);
    expect(call<number[]>(options.scales?.['x']?.range, chart, 0, 0)).toEqual([
      0, 275,
    ]);
    // A recording of one sample still has a range to draw.
    expect(
      call<number[]>(empty.scales?.['x']?.range, chart, 0, 0)[1],
    ).toBeGreaterThan(0);
    expect(options.axes?.[1]?.show).toBe(false);
    expect(options.cursor?.show).toBe(false);
  });
});
