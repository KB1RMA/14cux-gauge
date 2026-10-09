// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Ecu, type Transport } from '@kb1rma/libcomm14cux-ts';
import { onTestFinished } from 'vitest';
import { EcuSession, type EcuSessionOptions } from '../ecu/session';

/**
 * Long enough between polling passes that a test never sees a second one
 * (about 25 days, the longest `setTimeout` allows): the session polls once
 * as it connects, then leaves the link to what the test does.
 */
export const ONE_PASS_MS = 2 ** 31 - 1;

/**
 * A session whose connections are made over `transports`, one per connect,
 * each as a demo-kind source. Polls once per connection unless
 * `pollIntervalMs` says otherwise. Call it inside a test: the session is
 * closed when the test finishes.
 */
export function sessionOver(
  transports: Transport[],
  pollIntervalMs = ONE_PASS_MS,
  options: Omit<EcuSessionOptions, 'createConnection' | 'pollIntervalMs'> = {},
): { session: EcuSession; ecus: Ecu[] } {
  const ecus = transports.map((transport) => new Ecu(transport));
  const unused = [...ecus];
  const session = new EcuSession({
    ...options,
    pollIntervalMs: { demo: pollIntervalMs },
    createConnection: (source) => {
      const ecu = unused.shift();

      if (!ecu) {
        throw new Error('No transport left for another connection');
      }

      return {
        ecu,
        source,
        onLost: () => () => undefined,
        dispose: () => ecu.disconnect().catch(() => undefined),
      };
    },
  });

  onTestFinished(() => {
    session.dispose();
  });

  return { session, ecus };
}

/** Settles once `session` has published a snapshot. */
export function firstSnapshot(session: EcuSession): Promise<void> {
  return new Promise((resolve) => {
    if (session.getLive().snapshot) {
      resolve();

      return;
    }

    const stop = session.subscribeLive(() => {
      if (session.getLive().snapshot) {
        stop();
        resolve();
      }
    });
  });
}

/**
 * A session connected over `transport`, once its first polling pass has
 * read whatever the test planted in memory.
 */
export async function connectedSession(
  transport: Transport,
  pollIntervalMs = ONE_PASS_MS,
): Promise<{ session: EcuSession; ecu: Ecu }> {
  const {
    session,
    ecus: [ecu],
  } = sessionOver([transport], pollIntervalMs);

  if (!ecu) {
    throw new Error('No ECU was made');
  }

  await session.connect({ kind: 'demo' });
  await firstSnapshot(session);

  return { session, ecu };
}
