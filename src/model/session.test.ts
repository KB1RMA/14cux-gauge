// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { InvalidRecordError } from './record';
import { keepsWrites, readSession } from './session';

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
      formatVersion: 2,
    });
  });

  it('reads formats 2 and 3 as they are', () => {
    expect(readSession(FORMAT_2)).toEqual(FORMAT_2);
    expect(readSession({ ...FORMAT_2, formatVersion: 3 })).toEqual({
      ...FORMAT_2,
      formatVersion: 3,
    });
  });

  it('rejects a session from a newer version of the app', () => {
    expect(() => readSession({ ...FORMAT_2, formatVersion: 4 })).toThrow(
      new InvalidRecordError(
        'session',
        'format 4 is from a newer version of the app',
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
