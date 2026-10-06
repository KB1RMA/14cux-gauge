// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { sessionPath, type ReplayTab } from '../routing/paths';
import { useNavigateOnce } from '../routing/useNavigateOnce';
import type { LiveSnapshot } from '../ecu/poller';
import { recordedKeys } from '../metrics';
import { useReplay } from '../replay/useReplay';
import { LiveTiles } from './LiveTiles';
import { ReplayControls } from './ReplayControls';
import { ReplayGraphs } from './ReplayGraphs';
import dashboard from './Dashboard.module.css';
import styles from './Sessions.module.css';

/**
 * Plays a recorded session back through the same readings as the live
 * dashboard, and its graphs on a timeline that can be zoomed and scrubbed. Key it by session: the samples must not change.
 */
export function SessionReplay({
  id,
  tab,
  samples,
}: {
  id: string;
  tab: ReplayTab;
  samples: readonly LiveSnapshot[];
}) {
  const navigate = useNavigateOnce();
  const replay = useReplay(samples);
  // Only the readings that were taken while recording.
  const [keys] = useState(() => recordedKeys(samples));

  return (
    <div className={styles['replay']}>
      <ReplayControls replay={replay} />
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
          <ReplayGraphs samples={samples} replay={replay} recorded={keys} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
