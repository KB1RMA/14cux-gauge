// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { InvalidRecordError } from './record';
import { readRom } from './rom';

const STORED = {
  id: 'r1',
  source: 'serial',
  readAt: 1000,
  tuneNumber: 3652,
  tuneIdent: 0x23,
  size: 4,
  sha256: 'ab',
  bytes: new Uint8Array([1, 2, 3, 4]),
};

describe('readRom', () => {
  it('reads a stored image, with or without a hash', () => {
    expect(readRom(STORED)).toEqual(STORED);
    expect(readRom({ ...STORED, sha256: undefined })).toEqual({
      ...STORED,
      sha256: undefined,
    });
  });

  it('rejects an image without its bytes', () => {
    expect(() => readRom({ ...STORED, bytes: [1, 2, 3, 4] })).toThrow(
      InvalidRecordError,
    );
  });

  it('rejects an image whose details are damaged', () => {
    expect(() => readRom({ ...STORED, tuneNumber: '3652' })).toThrow(
      InvalidRecordError,
    );
  });
});
