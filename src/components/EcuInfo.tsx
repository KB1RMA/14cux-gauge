// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  Ecu,
  InvalidReadingError,
  type TuneRevision,
} from '@kb1rma/libcomm14cux-ts';
import { useEffect, useState } from 'react';
import { describeError } from '../ecu/errors';
import { hex } from '../hex';
import { InfoPopover } from './InfoPopover';
import styles from './Panel.module.css';

function libraryVersionString(): string {
  const { major, minor, patch } = Ecu.getLibraryVersion();

  return `${major}.${minor}.${patch}`;
}

interface TuneInfo {
  revision: TuneRevision;
  /**
   * The rev limit in rpm, `null` if the tune holds an invalid one, or
   * `undefined` if it could not be read.
   */
  rpmLimit: number | null | undefined;
}

async function readTune(ecu: Ecu): Promise<TuneInfo> {
  const revision = await ecu.getTuneRevision();
  const rpmLimit = await ecu.getRPMLimit().catch((e: unknown) => {
    if (e instanceof InvalidReadingError) {
      return null;
    }

    // Don't lose the tune revision over a failed rev limit read.
    return undefined;
  });

  return { revision, rpmLimit };
}

export function EcuInfo({ ecu }: { ecu: Ecu }) {
  const [info, setInfo] = useState<TuneInfo | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const tune = info?.revision;

  useEffect(() => {
    let current = true;

    readTune(ecu).then(
      (result) => {
        if (current) {
          setInfo(result);
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
        <dt>
          Tune number
          <InfoPopover label="Tune number">
            <p>
              The number of the tune (the fuelling and timing calibration) in
              the ECU’s ROM.
            </p>
          </InfoPopover>
        </dt>
        <dd>{tune ? tune.tuneNumber.toString().padStart(4, '0') : '…'}</dd>
        <dt>
          Tune ident
          <InfoPopover label="Tune ident">
            <p>Tells apart different builds of the same tune number.</p>
          </InfoPopover>
        </dt>
        <dd>{tune ? hex(tune.tuneIdent, 4) : '…'}</dd>
        <dt>
          Checksum fixer
          <InfoPopover label="Checksum fixer">
            <p>
              A byte chosen so the ROM’s checksum comes out right. It often
              differs on a ROM that has been edited.
            </p>
          </InfoPopover>
        </dt>
        <dd>{tune ? hex(tune.checksumFixer, 2) : '…'}</dd>
        <dt>
          Rev limit
          <InfoPopover label="Rev limit">
            <p>The engine speed this tune limits the engine to.</p>
          </InfoPopover>
        </dt>
        <dd>
          {info === undefined
            ? '…'
            : info.rpmLimit === null
              ? 'Not valid'
              : info.rpmLimit === undefined
                ? 'Unavailable'
                : `${info.rpmLimit} rpm`}
        </dd>
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
