// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBuildInfo } from './buildInfo';

describe('readBuildInfo', () => {
  let root: string;

  beforeEach(() => {
    // Outside any git checkout, so the commit comes from GITHUB_SHA.
    root = mkdtempSync(join(tmpdir(), 'build-info-'));
    writeFileSync(join(root, 'package.json'), '{"version": "1.2.3"}');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('describes a development build when RELEASE_TAG is unset', () => {
    expect(
      readBuildInfo({ root, env: { GITHUB_SHA: 'abc123' } }),
    ).toStrictEqual({ version: '1.2.3', commit: 'abc123', releaseTag: null });
  });

  it('treats an empty RELEASE_TAG as unset', () => {
    expect(readBuildInfo({ root, env: { RELEASE_TAG: '' } })).toStrictEqual({
      version: '1.2.3',
      commit: null,
      releaseTag: null,
    });
  });

  it('records the tag of a release build', () => {
    expect(
      readBuildInfo({ root, env: { RELEASE_TAG: 'v1.2.3' } }),
    ).toStrictEqual({ version: '1.2.3', commit: null, releaseTag: 'v1.2.3' });
  });

  it('refuses a release tag that does not match the version', () => {
    expect(() =>
      readBuildInfo({ root, env: { RELEASE_TAG: 'v1.2.4' } }),
    ).toThrow('RELEASE_TAG v1.2.4 does not match package.json version 1.2.3');
  });

  it('reads the commit from git in a checkout', () => {
    expect(readBuildInfo({ env: {} }).commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
