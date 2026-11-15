// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useId } from 'react';
import {
  CABLE_NOTES_URL,
  HARDWARE_NOTES_URL,
  connectionHelp,
} from '../ecu/connectionHelp';
import type { FailureStage } from '../ecu/errors';
import { ExternalLink } from './ExternalLink';
import styles from './ConnectionChecks.module.css';

/** What to check for a failure at `stage`, and where to read more. */
export function ConnectionChecks({ stage }: { stage: FailureStage }) {
  const { checks, cableNotes } = connectionHelp(stage);
  const id = useId();

  return (
    <>
      <h3 id={id} className={styles['heading']}>
        What to check
      </h3>
      <ul aria-labelledby={id} className={styles['checks']}>
        {checks.map((check) => (
          <li key={check}>{check}</li>
        ))}
      </ul>
      {cableNotes ? (
        <p>
          See the app&apos;s{' '}
          <ExternalLink href={HARDWARE_NOTES_URL}>hardware notes</ExternalLink>{' '}
          and the{' '}
          <ExternalLink href={CABLE_NOTES_URL}>
            cable and latency-timer notes
          </ExternalLink>
          .
        </p>
      ) : null}
    </>
  );
}
