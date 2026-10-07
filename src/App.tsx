// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router';
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
import { EcuWriteProvider } from './ecuWrite/EcuWriteProvider';
import { NotificationsProvider } from './notifications/NotificationsProvider';
import { PreferencesProvider } from './preferences/PreferencesProvider';
import { AppStatusProvider } from './pwa/AppStatusProvider';
import type { AppStatusStoreOptions } from './pwa/appStatusStore';
import { RecordingProvider } from './recording/RecordingProvider';
import {
  LIVE_PATH,
  LIVE_TAB_PATHS,
  SESSIONS_PATH,
  type LiveTab,
} from './routing/paths';
import { RomsProvider, type RomsProviderProps } from './roms/RomsProvider';
import {
  SessionsProvider,
  type SessionsProviderProps,
} from './sessions/SessionsProvider';
import styles from './App.module.css';

const VIEWS: readonly { label: string; to: string }[] = [
  { label: 'Live', to: LIVE_PATH },
  { label: 'Sessions', to: SESSIONS_PATH },
];

const DEFAULT_USAGE_COUNTER = goatCounter();

/** The live views, or the connect screen until there is an ECU to show. */
function Live({ tab }: { tab: LiveTab }) {
  const { state, ecu } = useEcu();

  return state.status === 'connected' && ecu ? (
    <Dashboard ecu={ecu} tab={tab} />
  ) : (
    <ConnectScreen />
  );
}

function Main({ usageCounter }: { usageCounter: UsageCounter | undefined }) {
  useUsageCounts(usageCounter);

  return (
    <main className={styles['main']}>
      {/* On every view, so a recording can be watched and stopped. */}
      <StatusBar />
      <Routes>
        <Route
          path={LIVE_TAB_PATHS.overview}
          element={<Live tab="overview" />}
        />
        <Route path={LIVE_TAB_PATHS.graphs} element={<Live tab="graphs" />} />
        <Route path={LIVE_TAB_PATHS.fuelMap} element={<Live tab="fuelMap" />} />
        <Route path={`${SESSIONS_PATH}/*`} element={<SessionsView />} />
        <Route path="*" element={<Navigate to={LIVE_PATH} replace />} />
      </Routes>
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
  return (
    <HashRouter>
      <PreferencesProvider>
        <AppStatusProvider {...(appStatus ? { options: appStatus } : {})}>
          <NotificationsProvider>
            <EcuProvider {...(pollIntervalMs ? { pollIntervalMs } : {})}>
              <EcuWriteProvider>
                <SessionsProvider
                  {...(openSessionStore ? { open: openSessionStore } : {})}
                >
                  <RecordingProvider>
                    <RomsProvider
                      {...(openRomStore ? { open: openRomStore } : {})}
                    >
                      <div className={styles['app']}>
                        <header className={styles['appBar']}>
                          <h1 className={styles['brand']}>14CUX Gauge</h1>
                          <nav aria-label="Views" className={styles['nav']}>
                            {VIEWS.map(({ label, to }) => (
                              <NavLink
                                key={to}
                                to={to}
                                className={styles['navItem'] ?? ''}
                              >
                                {label}
                              </NavLink>
                            ))}
                          </nav>
                          <PreferencesMenu
                            offerUsageCounts={usageCounter !== undefined}
                          />
                        </header>
                        <AppNotices />
                        <Main usageCounter={usageCounter} />
                        <Footer countsUsage={usageCounter !== undefined} />
                      </div>
                    </RomsProvider>
                  </RecordingProvider>
                </SessionsProvider>
              </EcuWriteProvider>
            </EcuProvider>
          </NotificationsProvider>
        </AppStatusProvider>
      </PreferencesProvider>
    </HashRouter>
  );
}
