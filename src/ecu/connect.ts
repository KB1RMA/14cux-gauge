// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { BAUD, BAUD_DOUBLE_SPEED, Ecu } from '@kb1rma/libcomm14cux-ts';
import { createDemoEngine } from '../demo/demoEngine';
import type { RecordedSource } from '../model/source';
import type { DiagnosticLog } from '../diagnostics/diagnosticLog';
import { TracingTransport } from '../diagnostics/tracingTransport';
import type { SerialPlatform, SerialPortHandle } from '../platform/platform';

/** Where an ECU connection comes from; kept so the app can reconnect. */
export type EcuSource =
  | { kind: 'serial'; port: SerialPortHandle; doubleSpeed: boolean }
  | { kind: 'demo' };

/**
 * How a recording or ROM image read from `source` names it in storage. A new
 * kind of connection must choose a stored name here, deliberately, rather
 * than widen what is stored.
 */
export function recordedSource(source: EcuSource): RecordedSource {
  switch (source.kind) {
    case 'serial':
      return 'serial';
    case 'demo':
      return 'demo';
  }
}

export interface EcuConnection {
  readonly ecu: Ecu;
  readonly source: EcuSource;
  /**
   * Calls `listener` if the link is lost outside of the ECU protocol (for
   * example the USB cable is unplugged). Returns an unsubscribe function.
   */
  onLost(listener: () => void): () => void;
  /** Disconnects the ECU and releases everything the connection owns. */
  dispose(): Promise<void>;
}

/**
 * Makes connections over `serial` for serial sources, and to the simulated
 * ECU for demo mode: the `createConnection` an `EcuSession` takes.
 */
export function ecuConnections(
  serial: SerialPlatform,
): (source: EcuSource, log?: DiagnosticLog) => EcuConnection {
  return (source, log) =>
    source.kind === 'demo'
      ? createDemoEcu()
      : createSerialEcu(serial, source, log);
}

function createSerialEcu(
  serial: SerialPlatform,
  source: Extract<EcuSource, { kind: 'serial' }>,
  log?: DiagnosticLog,
): EcuConnection {
  const baudRate = source.doubleSpeed ? BAUD_DOUBLE_SPEED : BAUD;
  const link = serial.open(source.port, { baudRate });
  const ecu = new Ecu(
    log ? new TracingTransport(link.transport, log) : link.transport,
  );

  log?.record(
    'event',
    `Serial port: ${source.port.description}; ${String(baudRate)} baud, 8N1, no flow control`,
  );

  return {
    ecu,
    source,
    onLost: (listener) => link.onLost(listener),
    async dispose() {
      // The port may already be gone (unplugged); there is nothing to recover.
      await ecu.disconnect().catch(() => undefined);
    },
  };
}

function createDemoEcu(): EcuConnection {
  const engine = createDemoEngine();
  const ecu = new Ecu(engine.link);

  return {
    ecu,
    source: { kind: 'demo' },
    onLost: () => () => undefined,
    async dispose() {
      engine.stop();
      await ecu.disconnect();
    },
  };
}
