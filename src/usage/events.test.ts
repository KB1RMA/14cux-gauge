// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { ConnectionState } from '../ecu/connectionState';
import { connectionEvent, recordingEvents } from './events';

const demo = { kind: 'demo' } as const;
const serial = {
  kind: 'serial',
  port: {} as SerialPort,
  doubleSpeed: false,
} as const;

describe('connectionEvent', () => {
  const idle: ConnectionState = { status: 'idle' };
  const connecting: ConnectionState = { status: 'connecting', source: serial };
  const connected: ConnectionState = { status: 'connected', source: serial };

  it('counts a connection by kind', () => {
    expect(connectionEvent(connecting, connected)).toBe('connected/serial');
    expect(
      connectionEvent(
        { status: 'connecting', source: demo },
        { status: 'connected', source: demo },
      ),
    ).toBe('connected/demo');
  });

  it('tells a failed connection from a lost one, with only the reason', () => {
    const failed: ConnectionState = {
      status: 'error',
      source: serial,
      message: 'The serial port is already open, perhaps in another tab.',
      detail: 'InvalidStateError: The port is already open.',
      reason: 'port-in-use',
    };

    expect(connectionEvent(connecting, failed)).toBe(
      'connect-failed/serial/port-in-use',
    );
    expect(connectionEvent(connected, { ...failed, reason: 'timeout' })).toBe(
      'connection-lost/serial/timeout',
    );
    expect(
      connectionEvent(connected, {
        status: 'error',
        source: serial,
        message: 'Lost',
      }),
    ).toBe('connection-lost/serial/other');
  });

  it('counts nothing for other changes, or no change', () => {
    expect(connectionEvent(idle, connecting)).toBeUndefined();
    expect(
      connectionEvent(connected, { status: 'idle', afterSession: true }),
    ).toBeUndefined();
    expect(connectionEvent(connected, connected)).toBeUndefined();
  });
});

describe('recordingEvents', () => {
  const off = { recording: false, error: undefined };
  const on = { recording: true, error: undefined };

  it('counts a recording starting and being saved', () => {
    expect(recordingEvents(off, on)).toEqual(['recording/started']);
    expect(recordingEvents(on, off)).toEqual(['recording/saved']);
  });

  it('counts a failure, which also saves what was recorded', () => {
    expect(
      recordingEvents(on, { recording: false, error: 'The browser is full.' }),
    ).toEqual(['recording/failed', 'recording/saved']);
  });

  it('counts a failure once, and nothing for no change', () => {
    const failed = { recording: false, error: 'The browser is full.' };

    expect(recordingEvents(failed, failed)).toEqual([]);
    expect(recordingEvents(on, on)).toEqual([]);
  });
});
