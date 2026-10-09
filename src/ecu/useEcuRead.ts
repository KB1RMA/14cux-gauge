// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useCallback, useEffect, useState } from 'react';
import { describeError } from './errors';
import type { EcuRead } from './reads';
import type { EcuLink } from './session';
import { useEcu } from './useEcu';
import { useEcuSession } from './useEcuSession';

/** Why a read was refused while a ROM read has the link to itself. */
const BUSY =
  'Not read: the ECU is busy reading its ROM image. Try again when it finishes.';

interface Outcome<T> {
  link: EcuLink;
  value?: T | undefined;
  error?: string | undefined;
}

/** A read on `on` that failed, keeping the last value read on it. */
function failedOn<T>(
  previous: Outcome<T> | undefined,
  on: EcuLink,
  error: string,
): Outcome<T> {
  return {
    link: on,
    ...(previous?.link === on && 'value' in previous
      ? { value: previous.value }
      : {}),
    error,
  };
}

export interface EcuReadResult<T> {
  /** The last value read on this connection, kept if a later read fails. */
  value: T | undefined;
  /** Why the last read on this connection failed, for the user. */
  error: string | undefined;
  /** Whether a read asked for with `read` is in progress. */
  reading: boolean;
  /** Reads again; does nothing unless connected. */
  read(): Promise<void>;
  clearError(): void;
}

/**
 * Runs an on-demand read (see `src/ecu/reads.ts`) on the connected ECU. Its
 * result belongs to the connection it was read from: a new or lost
 * connection starts with none, and a read that finishes on an old one is
 * dropped.
 *
 * @param options.onConnect - Read once on each connection, without being asked.
 */
export function useEcuRead<T>(
  ecuRead: EcuRead<T>,
  { onConnect = false }: { onConnect?: boolean } = {},
): EcuReadResult<T> {
  const session = useEcuSession();
  const { link } = useEcu();
  const [outcome, setOutcome] = useState<Outcome<T> | undefined>(undefined);
  const [readingOn, setReadingOn] = useState<EcuLink | undefined>(undefined);
  const current = link && outcome?.link === link ? outcome : undefined;

  // Reads on `on` and keeps the result, if `on` is still connected by then.
  const settle = useCallback(
    async (on: EcuLink) => {
      const ecu = session.ecuFor(on);

      if (!ecu) {
        return;
      }

      try {
        const value = await ecuRead(ecu);

        if (session.getSnapshot().link === on) {
          setOutcome({ link: on, value });
        }
      } catch (e) {
        if (session.getSnapshot().link === on) {
          setOutcome((previous) => failedOn(previous, on, describeError(e)));
        }
      }
    },
    [session, ecuRead],
  );

  useEffect(() => {
    if (onConnect && link) {
      void settle(link);
    }
  }, [onConnect, link, settle]);

  const read = useCallback(async () => {
    if (!link) {
      return;
    }

    // A holder that pauses polling (the ROM read) has the link to itself. A
    // read beside a write is like a polling pass, so it goes ahead. A read on
    // connect never meets such a holder: a new link starts free.
    if (session.getSnapshot().holder?.pausesPolling) {
      setOutcome((previous) => failedOn(previous, link, BUSY));

      return;
    }

    setReadingOn(link);
    setOutcome((previous) =>
      previous?.link === link ? { ...previous, error: undefined } : previous,
    );

    try {
      await settle(link);
    } finally {
      setReadingOn((previous) => (previous === link ? undefined : previous));
    }
  }, [session, link, settle]);

  const clearError = useCallback(() => {
    setOutcome((previous) =>
      previous?.error === undefined
        ? previous
        : { ...previous, error: undefined },
    );
  }, []);

  return {
    value: current?.value,
    error: current?.error,
    reading: link !== undefined && readingOn === link,
    read,
    clearError,
  };
}
