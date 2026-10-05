// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { describeBuild, parseBuildInfo, sameBuild } from './build';

const dev = { version: '1.2.3', commit: 'abcdef0123', releaseTag: null };

describe('sameBuild', () => {
  it('needs the version and the commit to match', () => {
    expect(sameBuild(dev, { ...dev })).toBe(true);
    expect(sameBuild(dev, { ...dev, commit: 'fffffff' })).toBe(false);
    expect(sameBuild(dev, { ...dev, version: '1.2.4' })).toBe(false);
  });
});

describe('describeBuild', () => {
  it('names a release by its tag', () => {
    expect(describeBuild({ ...dev, releaseTag: 'v1.2.3' })).toBe('v1.2.3');
  });

  it('names a development build by version and short commit', () => {
    expect(describeBuild(dev)).toBe('1.2.3 (abcdef0)');
    expect(describeBuild({ ...dev, commit: null })).toBe('1.2.3');
  });
});

describe('parseBuildInfo', () => {
  it('accepts a version.json body', () => {
    expect(parseBuildInfo(dev)).toEqual(dev);
  });

  it.each([
    ['null', null],
    ['a string', 'v1'],
    ['a missing version', { commit: null, releaseTag: null }],
    ['a numeric commit', { version: '1', commit: 5, releaseTag: null }],
    ['a missing tag', { version: '1', commit: null }],
    ['an HTML page parsed as JSON', undefined],
  ])('rejects %s', (_name, body) => {
    expect(parseBuildInfo(body)).toBeUndefined();
  });
});
