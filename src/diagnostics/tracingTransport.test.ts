// SPDX-License-Identifier: GPL-3.0-only
// Derived from libcomm14cux (https://github.com/colinbourassa/libcomm14cux)
// Copyright (C) Colin Bourassa. Licensed under the GNU GPL v3.
// ECU memory offsets and serial command bytes; written for 14cux-gauge, 2026.
import { Ecu, SimulatedTransport, TimeoutError } from 'comm14cux-ts';
import { DiagnosticLog } from './diagnosticLog';
import { TracingTransport } from './tracingTransport';

/** Engine speed (filtered pulse width), a 16-bit value at 0x007C. */
const ENGINE_SPEED_FILTERED = 0x007c;

function traced() {
  const inner = new SimulatedTransport();
  const log = new DiagnosticLog({ now: () => 0 });
  // Every read appears to take 3 ms.
  let time = 0;
  const transport = new TracingTransport(inner, log, () => (time += 3) - 3);

  return { inner, log, ecu: new Ecu(transport) };
}

const lines = (log: DiagnosticLog) =>
  log.snapshot().head.map(({ kind, message }) => `${kind} ${message}`);

describe('TracingTransport', () => {
  it('records the bytes of a read, in both directions', async () => {
    const { inner, log, ecu } = traced();

    inner.memory.set([0x27, 0x10], ENGINE_SPEED_FILTERED);
    await ecu.connect();

    expect(await ecu.getEngineRPM()).toBe(750);

    await ecu.disconnect();

    expect(lines(log)).toEqual([
      'event Opening serial port',
      'event Serial port open',
      // The read command for 0x007C: two bytes the ECU echoes, a last byte
      // it answers with the data instead.
      'tx 04',
      'rx 04 (3 ms)',
      'tx 01',
      'rx 01 (3 ms)',
      'tx FC',
      'rx 27 10 (3 ms)',
      'event Closing serial port',
    ]);
  });

  it('records a read that times out', async () => {
    const { inner, log, ecu } = traced();

    await ecu.connect();
    inner.silent = true;

    await expect(ecu.getEngineRPM()).rejects.toBeInstanceOf(TimeoutError);
    expect(lines(log)).toContainEqual(
      expect.stringMatching(
        /^error Read of 1 byte\(s\) failed after 3 ms \(timeout 100 ms\): TimeoutError: /,
      ),
    );
  });

  it('records a failed write', async () => {
    const { inner, log, ecu } = traced();

    await ecu.connect();
    inner.failWrites = true;

    await expect(ecu.getEngineRPM()).rejects.toThrow();
    expect(lines(log)).toContainEqual(
      expect.stringMatching(/^error Write failed: /),
    );
  });

  it('records a port that will not open or close', async () => {
    const failing = {
      open: () => Promise.reject(new DOMException('Busy.', 'NetworkError')),
      close: () => Promise.reject(new DOMException('Gone.', 'NetworkError')),
      write: () => Promise.resolve(),
      read: () => Promise.resolve(new Uint8Array(0)),
    };
    const log = new DiagnosticLog();
    const transport = new TracingTransport(failing, log);

    await expect(transport.open()).rejects.toThrow('Busy.');
    await expect(transport.close()).rejects.toThrow('Gone.');
    expect(lines(log)).toEqual([
      'event Opening serial port',
      'error Opening serial port failed: NetworkError: Busy.',
      'event Closing serial port',
      'error Closing serial port failed: NetworkError: Gone.',
    ]);
  });
});
