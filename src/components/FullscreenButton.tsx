// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useId } from 'react';
import { useFullscreen } from '../screen/useFullscreen';
import styles from './FullscreenButton.module.css';

/** A button that shows the app full screen, or says why it cannot. */
export function FullscreenButton() {
  const fullscreen = useFullscreen();
  const noteId = useId();

  return (
    <div className={styles['fullscreen']}>
      {fullscreen.available ? (
        <button
          type="button"
          aria-pressed={fullscreen.active}
          onClick={() => void fullscreen.toggle()}
        >
          Full screen
        </button>
      ) : (
        <button type="button" disabled aria-describedby={noteId}>
          Full screen
        </button>
      )}
      {fullscreen.available ? null : (
        <span id={noteId} className={styles['note']}>
          Not supported in this browser
        </span>
      )}
      {fullscreen.error ? (
        <span role="alert" className={styles['note']}>
          {fullscreen.error}
        </span>
      ) : null}
    </div>
  );
}
