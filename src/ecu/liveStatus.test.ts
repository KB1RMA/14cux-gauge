// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { EcuSource } from './connect';
import { liveStatus } from './liveStatus';

const source: EcuSource = { kind: 'demo' };

describe('liveStatus', () => {
  it('is live only while connected and polling', () => {
    expect(
      liveStatus({ status: 'connected', source }, undefined, false),
    ).toEqual({ live: true });
  });

  it('says readings are not current while connecting', () => {
    expect(
      liveStatus({ status: 'connecting', source }, undefined, false),
    ).toEqual({ live: false, reason: 'Connecting to the ECU.' });
  });

  it('gives the reason a connection failed', () => {
    expect(
      liveStatus(
        { status: 'error', source, message: 'The cable was unplugged.' },
        undefined,
        false,
      ),
    ).toEqual({
      live: false,
      reason: 'The connection was lost: The cable was unplugged.',
    });
  });

  it('says so when not connected', () => {
    expect(liveStatus({ status: 'idle' }, undefined, false)).toEqual({
      live: false,
      reason: 'Not connected to an ECU.',
    });
  });

  it('says why polling is paused', () => {
    const connected = { status: 'connected', source } as const;

    expect(
      liveStatus(connected, { kind: 'write', pausesPolling: true }, true),
    ).toEqual({
      live: false,
      reason: 'Polling is paused while the app writes to the ECU.',
    });
    expect(
      liveStatus(connected, { kind: 'romRead', pausesPolling: true }, true),
    ).toEqual({
      live: false,
      reason: 'Polling is paused while the app reads the ECU’s ROM.',
    });
  });

  it('still says so when polling is paused for no known holder', () => {
    expect(
      liveStatus({ status: 'connected', source }, undefined, true),
    ).toEqual({ live: false, reason: 'Polling is paused.' });
  });
});
