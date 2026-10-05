// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { ConnectScreen } from './components/ConnectScreen';
import { Dashboard } from './components/Dashboard';
import { Footer } from './components/Footer';
import { PreferencesMenu } from './components/PreferencesMenu';
import { StatusBar } from './components/StatusBar';
import { EcuProvider, type EcuProviderProps } from './ecu/EcuProvider';
import { useEcu } from './ecu/useEcu';
import { PreferencesProvider } from './preferences/PreferencesProvider';
import styles from './App.module.css';

function Main() {
  const { state, ecu } = useEcu();

  return (
    <main className={styles['main']}>
      <StatusBar />
      {state.status === 'connected' && ecu ? (
        <Dashboard ecu={ecu} />
      ) : (
        <ConnectScreen />
      )}
    </main>
  );
}

export function App({
  pollIntervalMs,
}: Pick<EcuProviderProps, 'pollIntervalMs'>) {
  return (
    <PreferencesProvider>
      <EcuProvider {...(pollIntervalMs ? { pollIntervalMs } : {})}>
        <div className={styles['app']}>
          <header className={styles['appBar']}>
            <h1 className={styles['brand']}>14CUX Gauge</h1>
            <PreferencesMenu />
          </header>
          <Main />
          <Footer />
        </div>
      </EcuProvider>
    </PreferencesProvider>
  );
}
