// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useEffect, useState } from 'react';
import type { LiveSnapshot } from '../ecu/poller';
import type { SampleHistory } from '../history/sampleHistory';
import type { MetricKey } from '../metrics';
import { countUpTo, ReplayHistory } from './replayHistory';

export const REPLAY_SPEEDS = [1, 2, 5, 10] as const;

export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** How often playback moves on, in milliseconds. */
export const REPLAY_TICK_MS = 100;

export interface Replay {
  /** The sample at the playback position. */
  snapshot: LiveSnapshot | undefined;
  /** The samples up to the playback position, for the graphs. */
  history: SampleHistory<MetricKey>;
  /** Milliseconds from the first sample. */
  position: number;
  /** Milliseconds from the first sample to the last. */
  duration: number;
  playing: boolean;
  speed: ReplaySpeed;
  play(): void;
  pause(): void;
  /** Moves to `position`; playback carries on if it was playing. */
  seek(position: number): void;
  setSpeed(speed: ReplaySpeed): void;
}

/**
 * Plays back recorded samples in real time (or faster). It starts paused at
 * the first sample, and stops at the last. `samples` must not change; key
 * the caller by session instead.
 */
export function useReplay(samples: readonly LiveSnapshot[]): Replay {
  const [replay] = useState(() => new ReplayHistory(samples));
  const start = samples[0]?.timestamp ?? 0;
  const duration = (samples.at(-1)?.timestamp ?? start) - start;
  const [position, setPosition] = useState(0);
  const [wantsToPlay, setWantsToPlay] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const atEnd = position >= duration;
  const playing = wantsToPlay && !atEnd;
  const count = countUpTo(samples, start + position);

  useEffect(() => {
    replay.show(count);
  }, [replay, count]);

  useEffect(() => {
    if (!playing) {
      return undefined;
    }

    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const step = (now - last) * speed;

      last = now;
      setPosition((current) => Math.min(current + step, duration));
    }, REPLAY_TICK_MS);

    return () => {
      clearInterval(timer);
    };
  }, [playing, speed, duration]);

  const play = useCallback(() => {
    // Playing from the end starts again.
    if (atEnd) {
      setPosition(0);
    }

    setWantsToPlay(true);
  }, [atEnd]);

  const pause = useCallback(() => {
    setWantsToPlay(false);
  }, []);

  const seek = useCallback(
    (next: number) => {
      // Once playback has reached the end, seeking back must not restart it.
      setWantsToPlay(playing);
      setPosition(Math.min(Math.max(0, next), duration));
    },
    [playing, duration],
  );

  return {
    snapshot: samples[count - 1],
    history: replay.history,
    position: Math.min(position, duration),
    duration,
    playing,
    speed,
    play,
    pause,
    seek,
    setSpeed,
  };
}
