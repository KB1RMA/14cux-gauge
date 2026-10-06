// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  BAUD,
  BAUD_DOUBLE_SPEED,
  Ecu,
  WebSerialTransport,
} from '@kb1rma/libcomm14cux-ts';
import { createDemoEngine } from '../demo/demoEngine';
import type { DiagnosticLog } from '../diagnostics/diagnosticLog';
import { TracingTransport } from '../diagnostics/tracingTransport';

/** Where an ECU connection comes from; kept so the app can reconnect. */
export type EcuSource =
  { kind: 'serial'; port: SerialPort; doubleSpeed: boolean } | { kind: 'demo' };

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

/** The USB IDs of a port, which identify the adapter chip (FTDI, CH340…). */
export function describePort(port: SerialPort): string {
  // Test doubles and some platforms have no getInfo().
  const info = typeof port.getInfo === 'function' ? port.getInfo() : {};
  const hex = (id: number | undefined) =>
    id === undefined ? 'unknown' : `0x${id.toString(16).padStart(4, '0')}`;

  return `USB vendor ${hex(info.usbVendorId)}, product ${hex(info.usbProductId)}`;
}

export function createWebSerialEcu(
  source: Extract<EcuSource, { kind: 'serial' }>,
  log?: DiagnosticLog,
): EcuConnection {
  const baudRate = source.doubleSpeed ? BAUD_DOUBLE_SPEED : BAUD;
  const serial = new WebSerialTransport(source.port, { baudRate });
  const ecu = new Ecu(log ? new TracingTransport(serial, log) : serial);

  log?.record(
    'event',
    `Serial port: ${describePort(source.port)}; ${String(baudRate)} baud, 8N1, no flow control`,
  );

  return {
    ecu,
    source,
    onLost(listener) {
      const handler = () => {
        listener();
      };

      source.port.addEventListener('disconnect', handler);

      return () => {
        source.port.removeEventListener('disconnect', handler);
      };
    },
    async dispose() {
      // The port may already be gone (unplugged); there is nothing to recover.
      await ecu.disconnect().catch(() => undefined);
    },
  };
}

export function createDemoEcu(): EcuConnection {
  const engine = createDemoEngine();
  const ecu = new Ecu(engine.transport);

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

export function createEcuConnection(
  source: EcuSource,
  log?: DiagnosticLog,
): EcuConnection {
  return source.kind === 'demo'
    ? createDemoEcu()
    : createWebSerialEcu(source, log);
}
