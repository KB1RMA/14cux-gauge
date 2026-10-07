// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuSource } from '../ecu/connect';
import type { LiveSnapshot } from '../ecu/poller';
import type { WriteLogEntry } from '../ecuWrite/writes';

/**
 * Recorded debug sessions: the live snapshots from one connection, kept so
 * they can be reviewed or exported later.
 *
 * `SessionStore` is the contract every backend meets: IndexedDB in the
 * browser, memory when storage is unavailable, and (later) files on disk in
 * the Electron app, reached over IPC. Everything is async and structured-
 * cloneable so a backend can live in another process.
 *
 * Snapshots are stored as the poller produced them, in the library's units,
 * so a recording does not depend on the display units chosen at the time.
 * Writes to the ECU made while recording are kept beside them.
 */

/**
 * Bumped when the stored shape changes; readers must check it.
 *
 * 1: the first format. 2: adds `notes`. 3: keeps the writes to the ECU made
 * while recording. Sessions in format 2 stay in it: whether any writes were
 * made during them is not known.
 */
export const SESSION_FORMAT_VERSION = 3;

export type SessionFormatVersion = 2 | typeof SESSION_FORMAT_VERSION;

export interface SessionSummary {
  id: string;
  name: string;
  source: EcuSource['kind'];
  /** `Date.now()` when recording started. */
  startedAt: number;
  /** `Date.now()` when recording stopped; `null` while recording, or if the app closed first. */
  endedAt: number | null;
  sampleCount: number;
  /** Free text the user keeps with the session; empty if none. */
  notes: string;
  formatVersion: SessionFormatVersion;
}

/** Whether `session` kept its writes to the ECU (format 3 on). */
export function keepsWrites(session: SessionSummary): boolean {
  return session.formatVersion >= 3;
}

export interface NewSession {
  name: string;
  source: EcuSource['kind'];
  startedAt: number;
}

/** The parts of a session the user can edit. */
export type SessionChanges = Partial<Pick<SessionSummary, 'name' | 'notes'>>;

export interface SessionStore {
  create(session: NewSession): Promise<SessionSummary>;
  /** Appends samples, in order, to a session. */
  append(id: string, samples: readonly LiveSnapshot[]): Promise<void>;
  /** Marks a session as finished at `endedAt`. */
  finish(id: string, endedAt: number): Promise<SessionSummary>;
  /** Renames a session or changes its notes. */
  update(id: string, changes: SessionChanges): Promise<SessionSummary>;
  /** Every session, newest first. */
  list(): Promise<SessionSummary[]>;
  get(id: string): Promise<SessionSummary | undefined>;
  /** Every sample in a session, in the order appended. */
  readSamples(id: string): Promise<LiveSnapshot[]>;
  /** Adds a write to a session, or replaces the one with the same `id`. */
  putWrite(id: string, write: WriteLogEntry): Promise<void>;
  /** Every write kept with a session, in the order they started. */
  readWrites(id: string): Promise<WriteLogEntry[]>;
  /** Deletes a session, its samples and its writes. Unknown ids are ignored. */
  remove(id: string): Promise<void>;
  close(): void;
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

export function byStart(a: WriteLogEntry, b: WriteLogEntry): number {
  return a.startedAt - b.startedAt;
}

/** A copy of `write`, so a store never shares one with its caller. */
export function copyWrite(write: WriteLogEntry): WriteLogEntry {
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

  async create(session: NewSession): Promise<SessionSummary> {
    const summary = emptySummary(session);

    this.sessions.set(summary.id, { summary, samples: [], writes: new Map() });

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

    return { ...entry.summary };
  }

  async update(id: string, changes: SessionChanges): Promise<SessionSummary> {
    const entry = this.entry(id);

    entry.summary = applyChanges(entry.summary, changes);

    return { ...entry.summary };
  }

  async list(): Promise<SessionSummary[]> {
    return [...this.sessions.values()]
      .map(({ summary }) => ({ ...summary }))
      .sort(newestFirst);
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

  async readWrites(id: string): Promise<WriteLogEntry[]> {
    return [...this.entry(id).writes.values()].map(copyWrite).sort(byStart);
  }

  async remove(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  close(): void {
    // Nothing to release.
  }

  private entry(id: string) {
    const entry = this.sessions.get(id);

    if (!entry) {
      throw new UnknownSessionError(id);
    }

    return entry;
  }
}
