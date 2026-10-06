// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useState } from 'react';
import { goatCounter, type UsageCounter } from './analytics/goatCounter';
import { useUsageCounts } from './analytics/useUsageCounts';
import { AppNotices } from './components/AppNotices';
import { ConnectScreen } from './components/ConnectScreen';
import { Dashboard } from './components/Dashboard';
import { Footer } from './components/Footer';
import { PreferencesMenu } from './components/PreferencesMenu';
import { SaveSessionDialog } from './components/SaveSessionDialog';
import { SessionsView } from './components/SessionsView';
import { StatusBar } from './components/StatusBar';
import { EcuProvider, type EcuProviderProps } from './ecu/EcuProvider';
import { useEcu } from './ecu/useEcu';
import { PreferencesProvider } from './preferences/PreferencesProvider';
import { AppStatusProvider } from './pwa/AppStatusProvider';
import type { AppStatusStoreOptions } from './pwa/appStatusStore';
import { RecordingProvider } from './recording/RecordingProvider';
import { RomsProvider, type RomsProviderProps } from './roms/RomsProvider';
import {
  SessionsProvider,
  type SessionsProviderProps,
} from './sessions/SessionsProvider';
import styles from './App.module.css';

type View = 'live' | 'sessions';

const VIEWS: readonly { id: View; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'sessions', label: 'Sessions' },
];

const DEFAULT_USAGE_COUNTER = goatCounter();

function Main({
  view,
  usageCounter,
}: {
  view: View;
  usageCounter: UsageCounter | undefined;
}) {
  const { state, ecu } = useEcu();

  useUsageCounts(usageCounter);
  let content;

  if (view === 'sessions') {
    content = <SessionsView />;
  } else if (state.status === 'connected' && ecu) {
    content = <Dashboard ecu={ecu} />;
  } else {
    content = <ConnectScreen />;
  }

  return (
    <main className={styles['main']}>
      {/* On every view, so a recording can be watched and stopped. */}
      <StatusBar />
      {content}
      <SaveSessionDialog />
    </main>
  );
}

export function App({
  pollIntervalMs,
  openSessionStore,
  openRomStore,
  appStatus,
  usageCounter = DEFAULT_USAGE_COUNTER,
}: Pick<EcuProviderProps, 'pollIntervalMs'> & {
  openSessionStore?: SessionsProviderProps['open'];
  openRomStore?: RomsProviderProps['open'];
  /** Overrides the offline and update checks; they are off outside a production build. */
  appStatus?: AppStatusStoreOptions;
  /** Counts usage anonymously; only set on the published site by default. */
  usageCounter?: UsageCounter | undefined;
}) {
  const [view, setView] = useState<View>('live');

  return (
    <PreferencesProvider>
      <AppStatusProvider {...(appStatus ? { options: appStatus } : {})}>
        <EcuProvider {...(pollIntervalMs ? { pollIntervalMs } : {})}>
          <SessionsProvider
            {...(openSessionStore ? { open: openSessionStore } : {})}
          >
            <RecordingProvider>
              <RomsProvider {...(openRomStore ? { open: openRomStore } : {})}>
                <div className={styles['app']}>
                  <header className={styles['appBar']}>
                    <h1 className={styles['brand']}>14CUX Gauge</h1>
                    <nav aria-label="Views" className={styles['nav']}>
                      {VIEWS.map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          className={styles['navItem']}
                          aria-current={view === id ? 'page' : undefined}
                          onClick={() => {
                            setView(id);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </nav>
                    <PreferencesMenu
                      offerUsageCounts={usageCounter !== undefined}
                    />
                  </header>
                  <AppNotices />
                  <Main view={view} usageCounter={usageCounter} />
                  <Footer countsUsage={usageCounter !== undefined} />
                </div>
              </RomsProvider>
            </RecordingProvider>
          </SessionsProvider>
        </EcuProvider>
      </AppStatusProvider>
    </PreferencesProvider>
  );
}
