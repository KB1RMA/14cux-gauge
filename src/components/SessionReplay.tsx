// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import type { LiveSnapshot } from '../ecu/poller';
import { HistoryContext } from '../ecu/contexts';
import { useReplay } from '../replay/useReplay';
import { GraphsView } from './GraphsView';
import { LiveTiles } from './LiveTiles';
import { ReplayControls } from './ReplayControls';
import dashboard from './Dashboard.module.css';
import styles from './Sessions.module.css';

/**
 * Plays a recorded session back through the same readings and graphs as
 * the live dashboard. Key it by session: the samples must not change.
 */
export function SessionReplay({
  samples,
}: {
  samples: readonly LiveSnapshot[];
}) {
  const replay = useReplay(samples);
  const [view, setView] = useState('readings');

  return (
    <div className={styles['replay']}>
      <ReplayControls replay={replay} />
      <Tabs.Root
        value={view}
        onValueChange={setView}
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
          <LiveTiles snapshot={replay.snapshot} />
        </Tabs.Content>
        <Tabs.Content value="graphs">
          <HistoryContext value={replay.history}>
            <GraphsView />
          </HistoryContext>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
