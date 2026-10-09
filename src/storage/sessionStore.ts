// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  SESSION_FORMAT_VERSION,
  type NewSession,
  type SessionChanges,
  type SessionSummary,
} from '../model/session';
import type { UnreadableRecord } from '../model/record';
import type { LiveSnapshot } from '../model/snapshot';
import type { RecordedWrite, WriteLogEntry } from '../model/write';
import { Listeners } from './listeners';

/**
 * Recorded debug sessions (see `src/model/session.ts`) and where they are
 * kept.
 *
 * `SessionStore` is the contract every backend meets: IndexedDB in the
 * browser, memory when storage is unavailable, and (later) files on disk in
 * the Electron app, reached over IPC. Everything is async and structured-
 * cloneable so a backend can live in another process. A backend that reads
 * stored summaries back runs them through `readSession`, which migrates
 * older formats and rejects records it cannot read.
 *
 * The stores are opened together by `openStorage`, which also closes them.
 */

export interface SessionStore {
  create(session: NewSession): Promise<SessionSummary>;
  /** Appends samples, in order, to a session. */
  append(id: string, samples: readonly LiveSnapshot[]): Promise<void>;
  /** Marks a session as finished at `endedAt`. */
  finish(id: string, endedAt: number): Promise<SessionSummary>;
  /** Renames a session or changes its notes. */
  update(id: string, changes: SessionChanges): Promise<SessionSummary>;
  /** Every session that can be read, newest first. */
  list(): Promise<SessionSummary[]>;
  /**
   * Stored sessions whose summary cannot be read (damaged, or from a newer
   * version of the app), so the user can see and delete them.
   */
  listUnreadable(): Promise<UnreadableRecord[]>;
  get(id: string): Promise<SessionSummary | undefined>;
  /** Every sample in a session, in the order appended. */
  readSamples(id: string): Promise<LiveSnapshot[]>;
  /** Adds a write to a session, or replaces the one with the same `id`. */
  putWrite(id: string, write: WriteLogEntry): Promise<void>;
  /**
   * Every write kept with a session, in the order they started, as recorded:
   * a newer version of the app may have recorded one this version does not
   * know.
   */
  readWrites(id: string): Promise<RecordedWrite[]>;
  /** Deletes a session, its samples and its writes. Unknown ids are ignored. */
  remove(id: string): Promise<void>;
  /**
   * Calls `listener` whenever the list of sessions may have changed: after
   * every create, finish, update or remove, including (for a backend that
   * can tell) ones made elsewhere, such as in another window. Appends and
   * writes are not reported; a session's samples and writes are read when
   * it is opened rather than watched. Returns a function that unsubscribes.
   */
  subscribe(listener: () => void): () => void;
}

export class UnknownSessionError extends Error {
  constructor(id: string) {
    super(`No recorded session with id ${id}`);
    this.name = 'UnknownSessionError';
  }
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

/** A new summary for `session`, with nothing recorded yet. */
export function emptySummary(session: NewSession): SessionSummary {
  return {
    ...session,
    id: newSessionId(),
    endedAt: null,
    sampleCount: 0,
    notes: '',
    formatVersion: SESSION_FORMAT_VERSION,
  };
}

/** `summary` with `changes` applied; fields left out stay as they are. */
export function applyChanges(
  summary: SessionSummary,
  { name, notes }: SessionChanges,
): SessionSummary {
  return {
    ...summary,
    ...(name === undefined ? {} : { name }),
    ...(notes === undefined ? {} : { notes }),
  };
}

export function newestFirst(a: SessionSummary, b: SessionSummary): number {
  return b.startedAt - a.startedAt;
}

export function byStart(a: RecordedWrite, b: RecordedWrite): number {
  return a.startedAt - b.startedAt;
}

/** A copy of `write`, so a store never shares one with its caller. */
export function copyWrite<T extends RecordedWrite>(write: T): T {
  return { ...write, outcome: { ...write.outcome } };
}

/**
 * Keeps sessions in memory only: the fallback when no persistent storage is
 * available, and a reference implementation for tests.
 */
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<
    string,
    {
      summary: SessionSummary;
      samples: LiveSnapshot[];
      writes: Map<string, WriteLogEntry>;
    }
  >();
  private readonly listeners = new Listeners();
  readonly subscribe = this.listeners.subscribe;

  async create(session: NewSession): Promise<SessionSummary> {
    const summary = emptySummary(session);

    this.sessions.set(summary.id, { summary, samples: [], writes: new Map() });
    this.listeners.notify();

    return { ...summary };
  }

  async append(id: string, samples: readonly LiveSnapshot[]): Promise<void> {
    const entry = this.entry(id);

    entry.samples.push(...samples.map((sample) => ({ ...sample })));
    entry.summary = {
      ...entry.summary,
      sampleCount: entry.summary.sampleCount + samples.length,
    };
  }

  async finish(id: string, endedAt: number): Promise<SessionSummary> {
    const entry = this.entry(id);

    entry.summary = { ...entry.summary, endedAt };
    this.listeners.notify();

    return { ...entry.summary };
  }

  async update(id: string, changes: SessionChanges): Promise<SessionSummary> {
    const entry = this.entry(id);

    entry.summary = applyChanges(entry.summary, changes);
    this.listeners.notify();

    return { ...entry.summary };
  }

  async list(): Promise<SessionSummary[]> {
    return [...this.sessions.values()]
      .map(({ summary }) => ({ ...summary }))
      .sort(newestFirst);
  }

  async listUnreadable(): Promise<UnreadableRecord[]> {
    // Only this visit's sessions, which are always readable.
    return [];
  }

  async get(id: string): Promise<SessionSummary | undefined> {
    const summary = this.sessions.get(id)?.summary;

    return summary ? { ...summary } : undefined;
  }

  async readSamples(id: string): Promise<LiveSnapshot[]> {
    return this.entry(id).samples.map((sample) => ({ ...sample }));
  }

  async putWrite(id: string, write: WriteLogEntry): Promise<void> {
    this.entry(id).writes.set(write.id, copyWrite(write));
  }

  async readWrites(id: string): Promise<RecordedWrite[]> {
    return [...this.entry(id).writes.values()].map(copyWrite).sort(byStart);
  }

  async remove(id: string): Promise<void> {
    this.sessions.delete(id);
    this.listeners.notify();
  }

  private entry(id: string) {
    const entry = this.sessions.get(id);

    if (!entry) {
      throw new UnknownSessionError(id);
    }

    return entry;
  }
}
