// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { IDENTITY } from '../test-support/identity';
import { InvalidRecordError } from './record';
import { keepsWrites, readSession, storedSession } from './session';

const FORMAT_2 = {
  id: 'a',
  name: 'Idle check',
  source: 'serial',
  startedAt: 10,
  endedAt: 20,
  sampleCount: 3,
  notes: 'Cold start',
  formatVersion: 2,
};

describe('readSession', () => {
  it('adds empty notes to a session recorded in format 1', () => {
    expect(
      readSession({
        id: 'v1',
        name: 'Old drive',
        source: 'demo',
        startedAt: 10,
        endedAt: null,
        sampleCount: 1,
        formatVersion: 1,
      }),
    ).toEqual({
      id: 'v1',
      name: 'Old drive',
      source: 'demo',
      startedAt: 10,
      endedAt: null,
      sampleCount: 1,
      notes: '',
      identity: null,
      formatVersion: 2,
    });
  });

  it('reads formats 2 and 3 as not having recorded the identity', () => {
    expect(readSession(FORMAT_2)).toEqual({ ...FORMAT_2, identity: null });
    expect(readSession({ ...FORMAT_2, formatVersion: 3 })).toEqual({
      ...FORMAT_2,
      identity: null,
      formatVersion: 3,
    });
  });

  it('reads the identity kept in format 4', () => {
    const format4 = { ...FORMAT_2, identity: IDENTITY, formatVersion: 4 };

    expect(readSession(format4)).toEqual(format4);
  });

  it('reads an identity with values that could not be read', () => {
    const identity = {
      tune: { status: 'failed', readAt: 1, message: 'The ECU stopped.' },
      rpmLimit: { status: 'invalid', readAt: 2 },
      fuelMap: { status: 'invalid', readAt: 3 },
      faultCodes: { status: 'failed', readAt: 4, message: 'Closed.' },
    };

    expect(
      readSession({ ...FORMAT_2, identity, formatVersion: 4 }).identity,
    ).toEqual(identity);
  });

  it('rejects an identity that is not in its shape', () => {
    const format4 = { ...FORMAT_2, identity: IDENTITY, formatVersion: 4 };

    expect(() =>
      readSession({
        ...format4,
        identity: {
          ...IDENTITY,
          tune: { status: 'invalid', readAt: 1 },
        },
      }),
    ).toThrow(/^The stored session could not be read: identity\.tune/);
    expect(() =>
      readSession({
        ...format4,
        identity: { ...IDENTITY, fuelMap: { status: 'read', readAt: 1 } },
      }),
    ).toThrow(InvalidRecordError);
    expect(() => readSession({ ...FORMAT_2, formatVersion: 4 })).toThrow(
      InvalidRecordError,
    );
  });

  it('rejects a session from a newer version of the app', () => {
    expect(() => readSession({ ...FORMAT_2, formatVersion: 5 })).toThrow(
      new InvalidRecordError(
        'session',
        'format 5 is from a newer version of the app',
      ),
    );
  });

  it('rejects a damaged session rather than passing it on', () => {
    expect(() => readSession({ ...FORMAT_2, name: 42 })).toThrow(
      InvalidRecordError,
    );
    expect(() => readSession({ ...FORMAT_2, source: 'bluetooth' })).toThrow(
      InvalidRecordError,
    );
    expect(() =>
      readSession({ ...FORMAT_2, formatVersion: undefined }),
    ).toThrow(InvalidRecordError);
    expect(() => readSession('a')).toThrow(InvalidRecordError);
  });

  it('names the field that is wrong', () => {
    expect(() => readSession({ ...FORMAT_2, sampleCount: 1.5 })).toThrow(
      /^The stored session could not be read: sampleCount: /,
    );
  });
});

describe('keepsWrites', () => {
  it('is true from format 3', () => {
    expect(keepsWrites(readSession(FORMAT_2))).toBe(false);
    expect(keepsWrites(readSession({ ...FORMAT_2, formatVersion: 3 }))).toBe(
      true,
    );
  });
});

describe('storedSession', () => {
  it('stores an older session without an identity, as its format has none', () => {
    expect(storedSession(readSession(FORMAT_2))).toEqual(FORMAT_2);
  });

  it('stores the identity of a format 4 session', () => {
    const format4 = { ...FORMAT_2, identity: IDENTITY, formatVersion: 4 };

    expect(storedSession(readSession(format4))).toEqual(format4);
  });
});
