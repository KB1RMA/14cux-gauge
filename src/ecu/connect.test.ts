// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { testPlatform } from '../test-support/platform';
import { ecuConnections } from './connect';

describe('ecuConnections', () => {
  it('has no byte count for demo mode, which has no serial line', async () => {
    const connection = ecuConnections(testPlatform().serial)({ kind: 'demo' });

    await connection.ecu.connect();
    await connection.ecu.getEngineRPM();

    expect(connection.bytesReceived()).toBeUndefined();
    await connection.dispose();
  });
});
