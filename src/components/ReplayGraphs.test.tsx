// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LiveSnapshot } from '../model/snapshot';
import type { TimelineMark } from '../charts/timelinePlugins';
import type { MetricKey } from '../metrics';
import { loadPlot } from '../charts/plotOptions';
import { browserPlatform } from '../platform/browser';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { useReplay } from '../replay/useReplay';
import { expectNoAxeViolations } from '../test-support/a11y';
import { installCanvasStandIns } from '../test-support/canvas';
import { snapshotAt } from '../test-support/snapshots';
import { TestPlatform } from '../test-support/TestApp';
import { ReplayControls } from './ReplayControls';
import { ReplayGraphs } from './ReplayGraphs';

const START = 1_700_000_000_000;

/** Ten seconds, one sample a second; the engine revs at eight seconds. */
const samples = Array.from({ length: 11 }, (_, i) =>
  snapshotAt(START + i * 1000, {
    engineRpm: i === 8 ? 3000 : 1000 + i * 10,
    mainVoltage: i === 3 ? null : 14,
  }),
);

function Replay({
  recording,
  recorded,
  writes,
}: {
  recording: readonly LiveSnapshot[];
  recorded?: readonly MetricKey[];
  writes?: readonly TimelineMark[];
}) {
  const replay = useReplay(recording);

  return (
    <TestPlatform platform={browserPlatform()}>
      <PreferencesProvider>
        <ReplayControls replay={replay} />
        <ReplayGraphs
          samples={recording}
          replay={replay}
          {...(recorded ? { recorded } : {})}
          {...(writes ? { writes } : {})}
        />
      </PreferencesProvider>
    </TestPlatform>
  );
}

function renderReplay(
  recording: readonly LiveSnapshot[] = samples,
  recorded?: readonly MetricKey[],
) {
  return render(
    <Replay recording={recording} {...(recorded ? { recorded } : {})} />,
  );
}

/** The text shown for one statistic ("Now", "Min", "Max") of a graph. */
function stat(name: string, term: string): string | null {
  const dt = within(screen.getByRole('figure', { name }))
    .getAllByRole('term')
    .find((element) => element.textContent === term);

  return dt?.nextElementSibling?.textContent ?? null;
}

function shown(): string {
  return screen.getByText(/^Graphs show/).textContent;
}

describe('ReplayGraphs', () => {
  it('graphs the whole recording at first, with the value at the playhead', async () => {
    const { container } = renderReplay();

    expect(shown()).toBe('Graphs show 0:00 to 0:10 of 0:10.');
    expect(stat('Engine speed (rpm)', 'Now')).toBe('1000 rpm');
    expect(stat('Engine speed (rpm)', 'Min')).toBe('1000 rpm');
    expect(stat('Engine speed (rpm)', 'Max')).toBe('3000 rpm');
    expect(stat('Main voltage (V)', 'Now')).toBe('14.0 V');
    expect(screen.getAllByRole('figure')).toHaveLength(25);
    expect(screen.getByRole('slider', { name: 'Graphs from' })).toHaveAttribute(
      'aria-valuetext',
      '0.0 seconds',
    );
    expect(screen.getByRole('slider', { name: 'Graphs to' })).toHaveAttribute(
      'aria-valuetext',
      '10.0 seconds',
    );
    await expectNoAxeViolations(container);
  });

  it('zooms with the buttons, and the text describes the visible stretch', async () => {
    const user = userEvent.setup();
    const { container } = renderReplay();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const showAll = screen.getByRole('button', { name: 'Show all' });

    // Already showing everything.
    expect(showAll).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(zoomIn);

    // Around the playhead, at the start.
    expect(shown()).toBe('Graphs show 0:00 to 0:05 of 0:10.');
    expect(stat('Engine speed (rpm)', 'Max')).toBe('1050 rpm');

    await user.click(zoomIn);
    await user.click(zoomIn);
    await user.click(zoomIn);

    // No narrower than a second; the button says so but keeps focus.
    expect(shown()).toBe('Graphs show 0:00 to 0:01 of 0:10.');
    expect(zoomIn).toHaveAttribute('aria-disabled', 'true');
    await user.click(zoomIn);
    expect(shown()).toBe('Graphs show 0:00 to 0:01 of 0:10.');

    await user.click(screen.getByRole('button', { name: 'Zoom out' }));

    expect(shown()).toBe('Graphs show 0:00 to 0:02 of 0:10.');

    await user.click(showAll);

    expect(shown()).toBe('Graphs show 0:00 to 0:10 of 0:10.');
    expect(showAll).toHaveFocus();
    await expectNoAxeViolations(container);
  });

  it('chooses the stretch with the slider thumbs', async () => {
    const user = userEvent.setup();

    renderReplay();
    screen.getByRole('slider', { name: 'Graphs from' }).focus();
    // A tenth of a second a press, for a recording ten seconds long.
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('slider', { name: 'Graphs from' })).toHaveAttribute(
      'aria-valuetext',
      '0.1 seconds',
    );

    await user.keyboard('{PageUp}{PageUp}{ArrowLeft}');

    expect(shown()).toBe('Graphs show 0:02 to 0:10 of 0:10.');
    expect(stat('Engine speed (rpm)', 'Min')).toBe('1020 rpm');

    screen.getByRole('slider', { name: 'Graphs to' }).focus();
    await user.keyboard('{PageDown}{PageDown}{PageDown}');

    expect(shown()).toBe('Graphs show 0:02 to 0:07 of 0:10.');
    expect(stat('Engine speed (rpm)', 'Max')).toBe('1070 rpm');
  });

  it('pages to the playhead when it moves outside the stretch', async () => {
    const user = userEvent.setup();

    renderReplay();
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    screen.getByRole('slider', { name: 'Playback position' }).focus();
    await user.keyboard('{End}');

    expect(shown()).toBe('Graphs show 0:05 to 0:10 of 0:10.');
    expect(stat('Engine speed (rpm)', 'Now')).toBe('1100 rpm');
    expect(stat('Engine speed (rpm)', 'Max')).toBe('3000 rpm');
  });

  it('says when the reading at the playhead was invalid', async () => {
    const user = userEvent.setup();

    renderReplay();
    screen.getByRole('slider', { name: 'Playback position' }).focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');

    expect(stat('Main voltage (V)', 'Now')).toBe('—No valid reading');
  });

  it('offers only the readings that were recorded', async () => {
    const user = userEvent.setup();
    const coolantOnly: LiveSnapshot[] = samples.map(({ timestamp }) => ({
      timestamp,
      coolantTempF: 190,
      milOn: false,
    }));

    renderReplay(coolantOnly, ['coolantTempF', 'milOn']);

    expect(screen.getAllByRole('figure')).toHaveLength(2);
    expect(
      screen.getByRole('figure', { name: 'Coolant (°F)' }),
    ).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /Choose graphs/ });

    expect(trigger).toHaveTextContent('2 of 2');
    await user.click(trigger);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('shows the graphs chosen for replay', () => {
    localStorage.setItem(
      'cuxGauge.graphs',
      JSON.stringify({ hidden: ['engineRpm'] }),
    );
    renderReplay();

    expect(screen.getAllByRole('figure')).toHaveLength(24);
    expect(
      screen.queryByRole('figure', { name: 'Engine speed (rpm)' }),
    ).not.toBeInTheDocument();
  });

  it('hides and shows graphs from Choose graphs, and remembers the choice', async () => {
    const user = userEvent.setup();

    renderReplay();
    await user.click(screen.getByRole('button', { name: /Choose graphs/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Engine speed' }));
    await user.keyboard('{Escape}');

    expect(screen.getAllByRole('figure')).toHaveLength(24);
    expect(
      JSON.parse(localStorage.getItem('cuxGauge.graphs') ?? '{}'),
    ).toMatchObject({
      hidden: ['engineRpm'],
    });
  });

  it('describes the window in whole seconds for a long recording', () => {
    // Five minutes, a sample every ten seconds: the slider steps 2 s.
    renderReplay(
      Array.from({ length: 31 }, (_, i) => snapshotAt(START + i * 10_000)),
    );

    expect(screen.getByRole('slider', { name: 'Graphs to' })).toHaveAttribute(
      'aria-valuetext',
      '5 minutes',
    );
  });

  it('works for a recording of one sample', () => {
    renderReplay([snapshotAt(START)]);

    expect(shown()).toBe('Graphs show 0:00 to 0:00 of 0:00.');
    expect(stat('Engine speed (rpm)', 'Now')).toBe('750 rpm');
  });
});

describe('ReplayGraphs drawing', () => {
  let restore: () => void;

  // Import the chart library once, with the stand-ins it reads as it loads.
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

  /** The plot area of a graph, or of the overview strip, once drawn. */
  async function plotArea(container: HTMLElement, index: number) {
    await vi.waitFor(() => {
      expect(container.querySelectorAll('.u-over')).toHaveLength(26);
    });

    const over = container.querySelectorAll<HTMLElement>('.u-over')[index];

    if (!over) {
      throw new Error(`No plot ${String(index)}`);
    }

    return over;
  }

  function position(): string | null {
    return screen
      .getByRole('slider', { name: 'Playback position' })
      .getAttribute('aria-valuetext');
  }

  it('marks writes to the ECU on the overview and every graph, naming them on the overview', async () => {
    const writes: TimelineMark[] = [
      { from: 2, to: 4.1, label: 'Fuel pump test', open: false },
      { from: 7, to: 10, label: 'Clear fault codes', open: true },
    ];
    const { container } = render(
      <Replay recording={samples} writes={writes} />,
    );
    const overview = await plotArea(container, 0);
    const graph = await plotArea(container, 1);

    expect(
      [...overview.querySelectorAll('[class*="markLabel"]')].map(
        (label) => label.textContent,
      ),
    ).toEqual(['Fuel pump test', 'Clear fault codes']);
    // A label on a graph would cover its samples.
    expect(graph.querySelector('[class*="markLabel"]')).toBeNull();

    for (const over of [overview, graph]) {
      expect(
        [...over.querySelectorAll<HTMLElement>('[data-open]')].map(
          (mark) => mark.dataset['open'],
        ),
      ).toEqual(['false', 'true']);
    }

    await expectNoAxeViolations(container);
  });

  it('draws the overview and a graph per metric, with a playhead over each', async () => {
    const { container, unmount } = renderReplay();
    const over = await plotArea(container, 1);

    expect(over.querySelector('[class*="playhead"]')).not.toBeNull();
    await expectNoAxeViolations(container);

    unmount();

    expect(container.querySelector('canvas')).toBeNull();
  });

  it('zooms with Ctrl and the wheel, and pans with Shift and the wheel', async () => {
    const { container } = renderReplay();
    const over = await plotArea(container, 1);

    fireEvent.wheel(over, { deltaY: -300, ctrlKey: true, clientX: 0 });

    expect(shown()).not.toBe('Graphs show 0:00 to 0:10 of 0:10.');
    expect(shown()).toMatch(/^Graphs show 0:00 to 0:0[4-6] of 0:10\.$/);

    // Lines, as some mice scroll, pan the same way as pixels.
    fireEvent.wheel(over, {
      deltaY: 20,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      shiftKey: true,
    });

    expect(shown()).toMatch(
      /^Graphs show 0:0[1-9] to 0:(0[5-9]|10) of 0:10\.$/,
    );

    fireEvent.wheel(over, {
      deltaX: 2,
      deltaMode: WheelEvent.DOM_DELTA_PAGE,
      shiftKey: true,
    });

    expect(shown()).toMatch(/to 0:10 of 0:10\.$/);

    const before = shown();

    // A plain wheel scrolls the page, not the graph.
    fireEvent.wheel(over, { deltaY: 300 });

    expect(shown()).toBe(before);
  });

  it('moves the playhead on a click, but not on a drag', async () => {
    const { container } = renderReplay();
    const over = await plotArea(container, 1);

    fireEvent.pointerDown(over, { pointerId: 1, clientX: 200 });
    fireEvent.pointerUp(over, { pointerId: 1, clientX: 201 });

    expect(position()).not.toBe('0 seconds of 10 seconds');

    const clicked = position();

    fireEvent.pointerDown(over, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(over, { pointerId: 1, clientX: 150 });
    fireEvent.pointerUp(over, { pointerId: 1, clientX: 150 });

    expect(position()).toBe(clicked);

    // A cancelled pointer does nothing.
    fireEvent.pointerDown(over, { pointerId: 1, clientX: 50 });
    fireEvent.pointerCancel(over, { pointerId: 1 });
    fireEvent.pointerUp(over, { pointerId: 1, clientX: 50 });

    expect(position()).toBe(clicked);
  });

  it('zooms with a two-finger pinch', async () => {
    const { container } = renderReplay();
    const over = await plotArea(container, 1);

    fireEvent.pointerDown(over, { pointerId: 1, clientX: 150 });
    fireEvent.pointerDown(over, { pointerId: 2, clientX: 250 });
    fireEvent.pointerMove(over, { pointerId: 2, clientX: 350 });
    // A pointer that went down elsewhere is not part of the pinch.
    fireEvent.pointerMove(over, { pointerId: 3, clientX: 0 });

    expect(shown()).not.toBe('Graphs show 0:00 to 0:10 of 0:10.');

    fireEvent.pointerUp(over, { pointerId: 2, clientX: 350 });
    fireEvent.pointerUp(over, { pointerId: 1, clientX: 150 });
  });

  it('zooms to a stretch dragged across a graph', async () => {
    const { container } = renderReplay();
    const over = await plotArea(container, 1);

    fireEvent.pointerDown(over, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(over, { pointerId: 1, clientX: 220 });
    fireEvent.pointerUp(over, { pointerId: 1, clientX: 220 });

    expect(shown()).not.toBe('Graphs show 0:00 to 0:10 of 0:10.');
  });

  it('shows the value under the pointer on every graph', async () => {
    const { container } = renderReplay();
    const over = await plotArea(container, 1);

    fireEvent.mouseMove(over, { clientX: 300, clientY: 50 });

    await vi.waitFor(() => {
      const readouts = [
        ...container.querySelectorAll<HTMLElement>('[class*="readout"]'),
      ];

      expect(readouts.filter((readout) => !readout.hidden)).toHaveLength(25);
    });

    expect(
      container.querySelector('[class*="readout"]:not([hidden])')?.textContent,
    ).toMatch(/^0:\d\d\.\d · \d+ rpm$/);
  });

  it('pans by dragging the overview, and moves the playhead on a click', async () => {
    const user = userEvent.setup();
    const { container } = renderReplay();
    const strip = await plotArea(container, 0);

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.pointerDown(strip, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(strip, { pointerId: 1, clientX: 102 });

    expect(shown()).toBe('Graphs show 0:00 to 0:05 of 0:10.');

    fireEvent.pointerMove(strip, { pointerId: 1, clientX: 200 });
    fireEvent.pointerUp(strip, { pointerId: 1, clientX: 200 });

    expect(shown()).not.toBe('Graphs show 0:00 to 0:05 of 0:10.');
    expect(position()).toBe('0 seconds of 10 seconds');

    fireEvent.pointerMove(strip, { pointerId: 1, clientX: 300 });
    fireEvent.pointerDown(strip, { pointerId: 1, clientX: 300 });
    fireEvent.pointerCancel(strip, { pointerId: 1 });
    fireEvent.pointerDown(strip, { pointerId: 1, clientX: 300 });
    fireEvent.pointerUp(strip, { pointerId: 1, clientX: 300 });

    expect(position()).not.toBe('0 seconds of 10 seconds');
  });

  it('moves the playhead as playback runs', async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });

    try {
      const { container } = renderReplay();
      const over = await plotArea(container, 1);
      const playhead = over.querySelector<HTMLElement>('[class*="playhead"]');
      const before = playhead?.style.transform;

      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(playhead?.style.transform).not.toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
