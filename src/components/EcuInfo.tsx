// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Ecu, type TuneRevision } from 'comm14cux-ts';
import { useEffect, useState } from 'react';
import { describeError } from '../ecu/errors';
import styles from './Panel.module.css';

function hex(value: number, digits: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`;
}

function libraryVersionString(): string {
  const { major, minor, patch } = Ecu.getLibraryVersion();

  return `${major}.${minor}.${patch}`;
}

export function EcuInfo({ ecu }: { ecu: Ecu }) {
  const [tune, setTune] = useState<TuneRevision | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let current = true;

    ecu.getTuneRevision().then(
      (revision) => {
        if (current) {
          setTune(revision);
        }
      },
      (e: unknown) => {
        if (current) {
          setError(describeError(e));
        }
      },
    );

    return () => {
      current = false;
    };
  }, [ecu]);

  return (
    <section className={styles['panel']} aria-labelledby="ecu-info-title">
      <h2 id="ecu-info-title">ECU info</h2>
      <dl className={styles['facts']}>
        <dt>Tune number</dt>
        <dd>{tune ? tune.tuneNumber.toString().padStart(4, '0') : '…'}</dd>
        <dt>Tune ident</dt>
        <dd>{tune ? hex(tune.tuneIdent, 4) : '…'}</dd>
        <dt>Checksum fixer</dt>
        <dd>{tune ? hex(tune.checksumFixer, 2) : '…'}</dd>
        <dt>comm14cux-ts</dt>
        <dd>{libraryVersionString()}</dd>
      </dl>
      {error ? (
        <p role="alert" className={styles['error']}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
