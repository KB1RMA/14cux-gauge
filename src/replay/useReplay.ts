// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useEffect, useState } from 'react';
import type { LiveSnapshot } from '../model/snapshot';
import {
  clampWindow,
  followPlayback,
  revealPosition,
  wholeWindow,
  type TimeWindow,
} from './timeline';

export const REPLAY_SPEEDS = [1, 2, 5, 10] as const;

export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** How often playback moves on, in milliseconds. */
export const REPLAY_TICK_MS = 100;

export interface Replay {
  /** The sample at the playback position. */
  snapshot: LiveSnapshot | undefined;
  /** Milliseconds from the first sample. */
  position: number;
  /** Milliseconds from the first sample to the last. */
  duration: number;
  /** The stretch of the recording the graphs show. */
  view: TimeWindow;
  playing: boolean;
  speed: ReplaySpeed;
  play(): void;
  pause(): void;
  /**
   * Moves to `position`; playback carries on if it was playing. The view
   * pages to the new position if it was outside.
   */
  seek(position: number): void;
  /** Shows another stretch of the recording, fitted inside it. */
  setView(view: TimeWindow): void;
  setSpeed(speed: ReplaySpeed): void;
}

interface Timeline {
  position: number;
  view: TimeWindow;
}

/** How many of `samples` (oldest first) were taken at or before `time`. */
function countUpTo(samples: readonly LiveSnapshot[], time: number): number {
  let low = 0;
  let high = samples.length;

  while (low < high) {
    const mid = (low + high) >>> 1;

    if ((samples[mid]?.timestamp ?? 0) <= time) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * Plays back recorded samples in real time (or faster). It starts paused at
 * the first sample, showing the whole recording, and stops at the last.
 * During playback the view pages forward whenever the playhead runs off its
 * end. `samples` must not change; key the caller by session instead.
 */
export function useReplay(samples: readonly LiveSnapshot[]): Replay {
  const start = samples[0]?.timestamp ?? 0;
  const duration = (samples.at(-1)?.timestamp ?? start) - start;
  const [timeline, setTimeline] = useState<Timeline>(() => ({
    position: 0,
    view: wholeWindow(duration),
  }));
  const { position, view } = timeline;
  const [wantsToPlay, setWantsToPlay] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const atEnd = position >= duration;
  const playing = wantsToPlay && !atEnd;
  const count = countUpTo(samples, start + position);

  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const step = (now - last) * speed;

      last = now;
      setTimeline((current) => {
        const next = Math.min(current.position + step, duration);

        return {
          position: next,
          view: followPlayback(current.view, current.position, next, duration),
        };
      });
    }, REPLAY_TICK_MS);

    return () => {
      clearInterval(timer);
    };
  }, [playing, speed, duration]);

  const moveTo = useCallback(
    (next: number) => {
      setTimeline((current) => ({
        position: next,
        view: revealPosition(current.view, next, duration),
      }));
    },
    [duration],
  );

  const play = useCallback(() => {
    // Playing from the end starts again.
    if (atEnd) {
      moveTo(0);
    }

    setWantsToPlay(true);
  }, [atEnd, moveTo]);

  const pause = useCallback(() => {
    setWantsToPlay(false);
  }, []);

  const seek = useCallback(
    (next: number) => {
      // Once playback has reached the end, seeking back must not restart it.
      setWantsToPlay(playing);
      moveTo(Math.min(Math.max(0, next), duration));
    },
    [playing, duration, moveTo],
  );

  const setView = useCallback(
    (next: TimeWindow) => {
      setTimeline((current) => ({
        ...current,
        view: clampWindow(next, duration),
      }));
    },
    [duration],
  );

  return {
    snapshot: samples[count - 1],
    position: Math.min(position, duration),
    duration,
    view,
    playing,
    speed,
    play,
    pause,
    seek,
    setView,
    setSpeed,
  };
}
