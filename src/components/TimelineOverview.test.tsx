// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type uPlot from 'uplot';
import type * as plotOptions from '../charts/plotOptions';
import type { LiveSnapshot } from '../model/snapshot';
import { historyOf } from '../history/pushSnapshot';
import { METRICS } from '../metrics';
import { loadPlot } from '../charts/plotOptions';
import { browserPlatform } from '../platform/browser';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { useReplay } from '../replay/useReplay';
import { installCanvasStandIns } from '../test-support/canvas';
import { snapshotAt } from '../test-support/snapshots';
import { TestPlatform } from '../test-support/TestApp';
import { PreferencesMenu } from './PreferencesMenu';
import { TimelineOverview } from './TimelineOverview';

// A canvas paints nothing a test can see, so these tests read the data each
// chart is built with: the plot class is wrapped to note it.
const drawn = vi.hoisted(() => ({ data: [] as uPlot.AlignedData[] }));

vi.mock('../charts/plotOptions', async (importOriginal) => {
  const actual = await importOriginal<typeof plotOptions>();

  return {
    ...actual,
    loadPlot: async () => {
      const Plot = await actual.loadPlot();

      return class extends Plot {
        constructor(
          options: uPlot.Options,
          data: uPlot.AlignedData,
          target?: HTMLElement,
        ) {
          super(options, data, target as HTMLElement);
          drawn.data.push(data);
        }
      } as typeof Plot;
    },
  };
});

const START = 1_700_000_000_000;

// The coolant reads 32 °F (0 °C), then 212 °F (100 °C), one second apart.
const recording: readonly LiveSnapshot[] = [32, 212].map((coolantTempF, i) =>
  snapshotAt(START + i * 1000, { coolantTempF }),
);
const series = historyOf(recording);
const coolant = METRICS.find((metric) => metric.key === 'coolantTempF');

function Overview() {
  const replay = useReplay(recording);

  if (!coolant) {
    throw new Error('No coolant metric');
  }

  return (
    <TestPlatform platform={browserPlatform()}>
      <PreferencesProvider>
        <PreferencesMenu />
        <TimelineOverview metric={coolant} series={series} replay={replay} />
      </PreferencesProvider>
    </TestPlatform>
  );
}

describe('TimelineOverview', () => {
  let restore: () => void;

  beforeAll(async () => {
    const restoreForImport = installCanvasStandIns();

    await loadPlot();
    restoreForImport();
  });

  beforeEach(() => {
    restore = installCanvasStandIns();
    drawn.data = [];
  });

  afterEach(() => {
    restore();
    localStorage.clear();
  });

  it('draws the strip in the chosen temperature unit, and redraws when it changes', async () => {
    const user = userEvent.setup();

    render(<Overview />);

    await vi.waitFor(() => {
      expect(drawn.data.at(-1)?.[1]).toEqual([32, 212]);
    });
    // Times are seconds into the recording.
    expect(drawn.data.at(-1)?.[0]).toEqual([0, 1]);

    await user.click(screen.getByRole('button', { name: 'Preferences' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Celsius' }));
    await user.keyboard('{Escape}');

    await vi.waitFor(() => {
      expect(drawn.data.at(-1)?.[1]).toEqual([0, 100]);
    });
  });
});
