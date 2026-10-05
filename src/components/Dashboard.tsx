// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { Ecu } from 'comm14cux-ts';
import { useEffect, useRef } from 'react';
import { useLiveData } from '../ecu/useLiveData';
import { EcuInfo } from './EcuInfo';
import { FaultCodes } from './FaultCodes';
import { LiveTiles } from './LiveTiles';
import styles from './Dashboard.module.css';

export function Dashboard({ ecu }: { ecu: Ecu }) {
  const { snapshot } = useLiveData();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The control that started the connection is gone once the dashboard
  // replaces the connect screen; move focus to the start of the new view.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={styles['dashboard']}>
      <section className={styles['live']} aria-labelledby="live-title">
        <h2
          id="live-title"
          ref={headingRef}
          tabIndex={-1}
          className={styles['title']}
        >
          Live data
        </h2>
        <LiveTiles snapshot={snapshot} />
      </section>
      <aside className={styles['side']}>
        <FaultCodes ecu={ecu} />
        <EcuInfo ecu={ecu} />
      </aside>
    </div>
  );
}
