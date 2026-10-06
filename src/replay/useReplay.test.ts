// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, renderHook } from '@testing-library/react';
import { snapshotAt } from '../test-support/snapshots';
import { REPLAY_TICK_MS, useReplay } from './useReplay';

/** Ten seconds, one sample a second, starting at a wall-clock time. */
const START = 1_700_000_000_000;
const samples = Array.from({ length: 11 }, (_, i) =>
  snapshotAt(START + i * 1000, { engineRpm: 1000 + i }),
);

function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useReplay', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts paused at the first sample', () => {
    const { result } = renderHook(() => useReplay(samples));

    expect(result.current).toMatchObject({
      position: 0,
      duration: 10_000,
      playing: false,
      speed: 1,
    });
    expect(result.current.snapshot?.engineRpm).toBe(1000);
    // The graphs show the whole recording.
    expect(result.current.view).toEqual({ start: 0, end: 10_000 });
  });

  it('plays in real time, and pauses', () => {
    const { result } = renderHook(() => useReplay(samples));

    act(() => {
      result.current.play();
    });
    tick(2000);

    expect(result.current.playing).toBe(true);
    expect(result.current.position).toBe(2000);
    expect(result.current.snapshot?.engineRpm).toBe(1002);

    act(() => {
      result.current.pause();
    });
    tick(2000);

    expect(result.current.playing).toBe(false);
    expect(result.current.position).toBe(2000);
  });

  it('plays faster at a higher speed', () => {
    const { result } = renderHook(() => useReplay(samples));

    act(() => {
      result.current.setSpeed(5);
      result.current.play();
    });
    tick(1000);

    expect(result.current.position).toBe(5000);
    expect(result.current.snapshot?.engineRpm).toBe(1005);
  });

  it('stops at the last sample, and plays again from the start', () => {
    const { result } = renderHook(() => useReplay(samples));

    act(() => {
      result.current.setSpeed(10);
      result.current.play();
    });
    tick(1000 + REPLAY_TICK_MS);

    expect(result.current.position).toBe(10_000);
    expect(result.current.playing).toBe(false);
    expect(result.current.snapshot?.engineRpm).toBe(1010);

    // Seeking back from the end does not start playing by itself.
    act(() => {
      result.current.seek(4000);
    });
    tick(1000);

    expect(result.current.position).toBe(4000);
    expect(result.current.playing).toBe(false);

    act(() => {
      result.current.seek(10_000);
    });
    act(() => {
      result.current.play();
    });

    expect(result.current.position).toBe(0);
    expect(result.current.playing).toBe(true);
  });

  it('keeps playing through a seek, and clamps it to the recording', () => {
    const { result } = renderHook(() => useReplay(samples));

    act(() => {
      result.current.play();
    });
    act(() => {
      result.current.seek(7000);
    });
    tick(1000);

    expect(result.current.playing).toBe(true);
    expect(result.current.position).toBe(8000);
    expect(result.current.snapshot?.engineRpm).toBe(1008);

    act(() => {
      result.current.seek(-500);
    });

    expect(result.current.position).toBe(0);

    act(() => {
      result.current.seek(60_000);
    });

    expect(result.current.position).toBe(10_000);
  });

  it('pages the view forward as playback runs off its end', () => {
    const { result } = renderHook(() => useReplay(samples));

    act(() => {
      result.current.setView({ start: 0, end: 3000 });
      result.current.setSpeed(10);
      result.current.play();
    });
    tick(200);

    expect(result.current.position).toBe(2000);
    expect(result.current.view).toEqual({ start: 0, end: 3000 });

    tick(200);

    expect(result.current.position).toBe(4000);
    expect(result.current.view).toEqual({ start: 3000, end: 6000 });

    tick(1000);

    // The last page ends at the end of the recording.
    expect(result.current.position).toBe(10_000);
    expect(result.current.view).toEqual({ start: 7000, end: 10_000 });
  });

  it('leaves alone a view the user moved away from the playhead', () => {
    const { result } = renderHook(() => useReplay(samples));

    act(() => {
      result.current.setView({ start: 6000, end: 8000 });
      result.current.play();
    });
    tick(1000);

    expect(result.current.position).toBe(1000);
    expect(result.current.view).toEqual({ start: 6000, end: 8000 });
  });

  it('pages the view to a seek outside it', () => {
    const { result } = renderHook(() => useReplay(samples));

    act(() => {
      result.current.setView({ start: 0, end: 2000 });
    });
    act(() => {
      result.current.seek(1500);
    });

    expect(result.current.view).toEqual({ start: 0, end: 2000 });

    act(() => {
      result.current.seek(5000);
    });

    expect(result.current.view).toEqual({ start: 5000, end: 7000 });

    // Playing again from the end goes back to the start, in view.
    act(() => {
      result.current.seek(10_000);
    });
    act(() => {
      result.current.play();
    });

    expect(result.current.view).toEqual({ start: 0, end: 2000 });
  });

  it('fits the view inside the recording', () => {
    const { result } = renderHook(() => useReplay(samples));

    act(() => {
      result.current.setView({ start: 9000, end: 13_000 });
    });

    expect(result.current.view).toEqual({ start: 6000, end: 10_000 });

    act(() => {
      result.current.setView({ start: 5000, end: 5100 });
    });

    expect(result.current.view).toEqual({ start: 4550, end: 5550 });
  });

  it('handles a recording of one sample', () => {
    const { result } = renderHook(() => useReplay([snapshotAt(START)]));

    act(() => {
      result.current.play();
    });

    expect(result.current).toMatchObject({
      position: 0,
      duration: 0,
      playing: false,
    });
    expect(result.current.snapshot?.engineRpm).toBe(750);
  });
});
