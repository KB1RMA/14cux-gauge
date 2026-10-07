// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { sessionPath, type ReplayTab } from '../routing/paths';
import { useNavigateOnce } from '../routing/useNavigateOnce';
import type { LiveSnapshot } from '../ecu/poller';
import type { WriteLogEntry } from '../ecuWrite/writes';
import { recordedKeys } from '../metrics';
import { useReplay } from '../replay/useReplay';
import { writeMarks } from '../sessions/writeLog';
import { LiveTiles } from './LiveTiles';
import { ReplayControls } from './ReplayControls';
import { ReplayGraphs } from './ReplayGraphs';
import { WriteLog } from './WriteLog';
import dashboard from './Dashboard.module.css';
import styles from './Sessions.module.css';

/**
 * Plays a recorded session back through the same readings as the live
 * dashboard, and its graphs on a timeline that can be zoomed and scrubbed,
 * with the writes to the ECU made while recording listed and marked on the
 * timeline. Key it by session: the samples and writes must not change.
 */
export function SessionReplay({
  id,
  tab,
  samples,
  writes,
  keepsWrites,
}: {
  id: string;
  tab: ReplayTab;
  samples: readonly LiveSnapshot[];
  writes: readonly WriteLogEntry[];
  /** Whether the session was recorded by a version that keeps writes. */
  keepsWrites: boolean;
}) {
  const navigate = useNavigateOnce();
  const replay = useReplay(samples);
  // Only the readings that were taken while recording.
  const [keys] = useState(() => recordedKeys(samples));
  const firstSampleAt = samples[0]?.timestamp ?? 0;
  const [marks] = useState(() =>
    writeMarks(writes, firstSampleAt, samples.at(-1)?.timestamp ?? 0),
  );

  return (
    <div className={styles['replay']}>
      <ReplayControls replay={replay} />
      <WriteLog
        writes={writes}
        keepsWrites={keepsWrites}
        firstSampleAt={firstSampleAt}
        replay={replay}
      />
      <Tabs.Root
        value={tab}
        onValueChange={(next) => {
          navigate(sessionPath(id, next === 'graphs' ? 'graphs' : 'readings'));
        }}
        className={dashboard['views']}
      >
        <Tabs.List aria-label="Replay views" className={dashboard['tabs']}>
          <Tabs.Trigger value="readings" className={dashboard['tab']}>
            Readings
          </Tabs.Trigger>
          <Tabs.Trigger value="graphs" className={dashboard['tab']}>
            Graphs
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="readings">
          <LiveTiles snapshot={replay.snapshot} keys={keys} />
        </Tabs.Content>
        <Tabs.Content value="graphs">
          <ReplayGraphs
            samples={samples}
            replay={replay}
            recorded={keys}
            writes={marks}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
