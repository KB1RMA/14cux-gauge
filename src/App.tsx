// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useState } from 'react';
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
import { RecordingProvider } from './recording/RecordingProvider';
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

function Main({ view }: { view: View }) {
  const { state, ecu } = useEcu();
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
}: Pick<EcuProviderProps, 'pollIntervalMs'> & {
  openSessionStore?: SessionsProviderProps['open'];
}) {
  const [view, setView] = useState<View>('live');

  return (
    <PreferencesProvider>
      <EcuProvider {...(pollIntervalMs ? { pollIntervalMs } : {})}>
        <SessionsProvider
          {...(openSessionStore ? { open: openSessionStore } : {})}
        >
          <RecordingProvider>
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
                <PreferencesMenu />
              </header>
              <Main view={view} />
              <Footer />
            </div>
          </RecordingProvider>
        </SessionsProvider>
      </EcuProvider>
    </PreferencesProvider>
  );
}
