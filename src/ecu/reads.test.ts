// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { Ecu, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { identityNotRead, readIdentity } from './reads';

describe('readIdentity', () => {
  it('keeps why each value could not be read, rather than throwing', async () => {
    const at = Date.UTC(2026, 9, 5, 14, 0, 0);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    onTestFinished(() => {
      vi.useRealTimers();
    });

    // Never connected, so every read is refused.
    const failed = {
      status: 'failed',
      readAt: at,
      message: 'The connection to the ECU was closed.',
    };

    expect(await readIdentity(new Ecu(new SimulatedTransport()))).toEqual({
      tune: failed,
      rpmLimit: failed,
      fuelMap: failed,
      faultCodes: failed,
    });
  });
});

describe('identityNotRead', () => {
  it('marks every value as not read, for one reason', () => {
    const failed = { status: 'failed', readAt: 5, message: 'Busy.' };

    expect(identityNotRead('Busy.', 5)).toEqual({
      tune: failed,
      rpmLimit: failed,
      fuelMap: failed,
      faultCodes: failed,
    });
  });
});
