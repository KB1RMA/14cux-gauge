// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { BAUD, BAUD_DOUBLE_SPEED, Ecu, WebSerialTransport } from 'comm14cux-ts';
import { createDemoEngine } from '../demo/demoEngine';

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

export function createWebSerialEcu(
  source: Extract<EcuSource, { kind: 'serial' }>,
): EcuConnection {
  const transport = new WebSerialTransport(source.port, {
    baudRate: source.doubleSpeed ? BAUD_DOUBLE_SPEED : BAUD,
  });
  const ecu = new Ecu(transport);

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

export function createEcuConnection(source: EcuSource): EcuConnection {
  return source.kind === 'demo' ? createDemoEcu() : createWebSerialEcu(source);
}
