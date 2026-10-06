// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  InvalidReadingError,
  NotConnectedError,
  ProtocolError,
  ReadCancelledError,
  TimeoutError,
} from '@kb1rma/libcomm14cux-ts';
import { errorReason } from './errors';

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
