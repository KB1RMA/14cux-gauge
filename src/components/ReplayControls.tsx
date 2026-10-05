// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { PauseIcon, PlayIcon } from '@radix-ui/react-icons';
import { Slider, ToggleGroup } from 'radix-ui';
import type { Replay } from '../replay/useReplay';
import { REPLAY_SPEEDS } from '../replay/useReplay';
import { describeDuration, formatDuration } from '../sessions/format';
import styles from './ReplayControls.module.css';

/** Arrow keys move the position a second; Page Up and Down ten. */
const SLIDER_STEP_MS = 1000;

/** Play/pause, a position slider and a speed choice for a replay. */
export function ReplayControls({ replay }: { replay: Replay }) {
  const { position, duration, playing, speed } = replay;

  return (
    <div className={styles['controls']}>
      <button
        type="button"
        className={`primary ${styles['play'] ?? ''}`}
        onClick={playing ? replay.pause : replay.play}
      >
        {playing ? (
          <PauseIcon aria-hidden="true" />
        ) : (
          <PlayIcon aria-hidden="true" />
        )}
        {playing ? 'Pause' : 'Play'}
      </button>

      <Slider.Root
        className={styles['slider']}
        min={0}
        // Radix snaps every value to a whole step, so the range must be a
        // whole number of steps for End to reach the last sample; seek()
        // clamps the extra fraction of a second back to the recording.
        max={Math.max(Math.ceil(duration / SLIDER_STEP_MS), 1) * SLIDER_STEP_MS}
        step={SLIDER_STEP_MS}
        value={[position]}
        disabled={duration === 0}
        onValueChange={([next]) => {
          if (next !== undefined) {
            replay.seek(next);
          }
        }}
      >
        <Slider.Track className={styles['track']}>
          <Slider.Range className={styles['range']} />
        </Slider.Track>
        <Slider.Thumb
          className={styles['thumb']}
          aria-label="Playback position"
          aria-valuetext={`${describeDuration(position)} of ${describeDuration(duration)}`}
        />
      </Slider.Root>

      <span className={styles['time']}>
        {formatDuration(position)} / {formatDuration(duration)}
      </span>

      <ToggleGroup.Root
        type="single"
        aria-label="Playback speed"
        className={styles['speeds']}
        value={String(speed)}
        onValueChange={(next) => {
          const chosen = REPLAY_SPEEDS.find((s) => String(s) === next);

          // Radix reports '' when the pressed item is pressed again; keep it.
          if (chosen) {
            replay.setSpeed(chosen);
          }
        }}
      >
        {REPLAY_SPEEDS.map((option) => (
          <ToggleGroup.Item
            key={option}
            value={String(option)}
            className={styles['speed']}
          >
            {option}×
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}
