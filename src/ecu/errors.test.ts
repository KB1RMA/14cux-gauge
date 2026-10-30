// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  InvalidReadingError,
  NotConnectedError,
  ProtocolError,
  ReadCancelledError,
  TimeoutError,
} from '@kb1rma/libcomm14cux-ts';
import { errorReason, failureStage } from './errors';

describe('failureStage', () => {
  const opened = { opened: true, answered: false, bytesReceived: 0 };

  it('blames the browser only when it refused the port', () => {
    const closed = { ...opened, opened: false };

    expect(failureStage(new DOMException('No', 'SecurityError'), closed)).toBe(
      'browser',
    );
    expect(failureStage(new DOMException('No', 'NetworkError'), closed)).toBe(
      'port',
    );
  });

  it('calls a timeout silent only if not one byte arrived', () => {
    expect(failureStage(new TimeoutError('No data'), opened)).toBe('silent');
    expect(
      failureStage(new TimeoutError('No data'), {
        ...opened,
        bytesReceived: 1,
      }),
    ).toBe('garbled');
    expect(
      failureStage(new TimeoutError('No data', { receivedBytes: 1 }), opened),
    ).toBe('garbled');
  });

  it('calls unreadable bytes garbled', () => {
    expect(failureStage(new ProtocolError('Bad echo'), opened)).toBe('garbled');
    expect(failureStage(new DOMException('Bad', 'FramingError'), opened)).toBe(
      'garbled',
    );
    expect(failureStage(new DOMException('Bad', 'BreakError'), opened)).toBe(
      'garbled',
    );
  });

  it('calls any other error on an open port a port failure', () => {
    expect(failureStage(new DOMException('Gone', 'NetworkError'), opened)).toBe(
      'port',
    );
    expect(failureStage(new NotConnectedError('Closed'), opened)).toBe('port');
  });

  it('never blames the wiring once the ECU has answered', () => {
    const answered = { ...opened, answered: true, bytesReceived: 500 };

    expect(failureStage(new TimeoutError('No data'), answered)).toBe('lost');
    expect(failureStage(new ProtocolError('Bad echo'), answered)).toBe('lost');
  });
});

describe('errorReason', () => {
  it('names each ECU error', () => {
    expect(errorReason(new TimeoutError('No data'))).toBe('timeout');
    expect(errorReason(new ProtocolError('Bad echo'))).toBe('protocol');
    expect(errorReason(new NotConnectedError('Closed'))).toBe('closed');
    expect(errorReason(new ReadCancelledError('Cancelled'))).toBe('cancelled');
    expect(errorReason(new InvalidReadingError('Out of range'))).toBe(
      'invalid-reading',
    );
  });

  it('names each Web Serial error', () => {
    const domError = (name: string) => new DOMException('Any message', name);

    expect(errorReason(domError('NotFoundError'))).toBe('no-port');
    expect(errorReason(domError('InvalidStateError'))).toBe('port-in-use');
    expect(errorReason(domError('NetworkError'))).toBe('port-error');
    expect(errorReason(domError('SecurityError'))).toBe('blocked');
    expect(errorReason(domError('AbortError'))).toBe('other');
  });

  it('never passes on anything from the message', () => {
    expect(errorReason(new Error('ttyUSB0 on /home/someone'))).toBe('other');
    expect(errorReason('a string')).toBe('other');
  });
});
