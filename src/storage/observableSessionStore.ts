// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { LiveSnapshot } from '../ecu/poller';
import type {
  NewSession,
  SessionChanges,
  SessionStore,
  SessionSummary,
} from './sessionStore';

/**
 * A {@link SessionStore} that tells subscribers when the list of sessions
 * changes, so a view of it can refresh. It is an external store for
 * `useSyncExternalStore`: the version changes after every create, finish,
 * update or remove that succeeds.
 *
 * Appends are not reported. They happen every second while recording, and
 * a session's samples are read when it is opened rather than watched.
 */
export class ObservableSessionStore implements SessionStore {
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly inner: SessionStore) {}

  async create(session: NewSession): Promise<SessionSummary> {
    return this.changed(await this.inner.create(session));
  }

  append(id: string, samples: readonly LiveSnapshot[]): Promise<void> {
    return this.inner.append(id, samples);
  }

  async finish(id: string, endedAt: number): Promise<SessionSummary> {
    return this.changed(await this.inner.finish(id, endedAt));
  }

  async update(id: string, changes: SessionChanges): Promise<SessionSummary> {
    return this.changed(await this.inner.update(id, changes));
  }

  list(): Promise<SessionSummary[]> {
    return this.inner.list();
  }

  get(id: string): Promise<SessionSummary | undefined> {
    return this.inner.get(id);
  }

  readSamples(id: string): Promise<LiveSnapshot[]> {
    return this.inner.readSamples(id);
  }

  async remove(id: string): Promise<void> {
    await this.inner.remove(id);
    this.changed(undefined);
  }

  close(): void {
    this.inner.close();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = (): number => this.version;

  private changed<T>(result: T): T {
    this.version++;

    for (const listener of this.listeners) {
      listener();
    }

    return result;
  }
}
