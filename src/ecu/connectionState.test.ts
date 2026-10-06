// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { connectionReducer, type ConnectionState } from './connectionState';

const demo = { kind: 'demo' } as const;

describe('connectionReducer', () => {
  it('walks idle → connecting → connected → error → idle', () => {
    let state: ConnectionState = { status: 'idle' };

    state = connectionReducer(state, { type: 'connect', source: demo });
    expect(state).toEqual({ status: 'connecting', source: demo });

    state = connectionReducer(state, { type: 'connected' });
    expect(state).toEqual({ status: 'connected', source: demo });

    state = connectionReducer(state, { type: 'failed', message: 'lost' });
    expect(state).toEqual({ status: 'error', source: demo, message: 'lost' });

    state = connectionReducer(state, { type: 'disconnected' });
    expect(state).toEqual({ status: 'idle', afterSession: true });
  });

  it('keeps the raw error detail of a failure', () => {
    const connecting: ConnectionState = { status: 'connecting', source: demo };

    expect(
      connectionReducer(connecting, {
        type: 'failed',
        message: 'The ECU stopped responding.',
        detail: 'TimeoutError: No data from ECU for 100 ms',
      }),
    ).toEqual({
      status: 'error',
      source: demo,
      message: 'The ECU stopped responding.',
      detail: 'TimeoutError: No data from ECU for 100 ms',
    });
  });

  it('ignores late results that no longer apply', () => {
    const idle: ConnectionState = { status: 'idle' };

    expect(connectionReducer(idle, { type: 'connected' })).toBe(idle);
    expect(connectionReducer(idle, { type: 'failed', message: 'x' })).toBe(
      idle,
    );
  });
});
