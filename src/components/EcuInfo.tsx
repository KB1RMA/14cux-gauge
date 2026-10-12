// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { libraryVersion, readTuneInfo } from '../ecu/reads';
import { useEcuRead } from '../ecu/useEcuRead';
import {
  formatChecksumFixer,
  formatTuneIdent,
  formatTuneNumber,
  NOT_VALID,
} from '../sessions/identity';
import { InfoPopover } from './InfoPopover';
import styles from './Panel.module.css';

export function EcuInfo() {
  const { value: info, error } = useEcuRead(readTuneInfo, { onConnect: true });
  const tune = info?.revision;

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
        <dd>{tune ? formatTuneNumber(tune.tuneNumber) : '…'}</dd>
        <dt>
          Tune ident
          <InfoPopover label="Tune ident">
            <p>Tells apart different builds of the same tune number.</p>
          </InfoPopover>
        </dt>
        <dd>{tune ? formatTuneIdent(tune.tuneIdent) : '…'}</dd>
        <dt>
          Checksum fixer
          <InfoPopover label="Checksum fixer">
            <p>
              A byte chosen so the ROM’s checksum comes out right. It often
              differs on a ROM that has been edited.
            </p>
          </InfoPopover>
        </dt>
        <dd>{tune ? formatChecksumFixer(tune.checksumFixer) : '…'}</dd>
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
              ? NOT_VALID
              : info.rpmLimit === undefined
                ? 'Unavailable'
                : `${info.rpmLimit} rpm`}
        </dd>
        <dt>comm14cux-ts</dt>
        <dd>{libraryVersion()}</dd>
      </dl>
      {error ? (
        <p role="alert" className={styles['error']}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
