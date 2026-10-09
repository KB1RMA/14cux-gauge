// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { blockStorage } from '../test-support/storage';
import {
  affectsSetting,
  asRecord,
  oneOf,
  parseRawSetting,
  readRawSetting,
  writeSetting,
} from './settings';

const parseWindow = (stored: unknown) => oneOf(stored, [30, 60, 300], 60);

describe('settings', () => {
  it('stores JSON under the cuxGauge prefix and reads it back', () => {
    expect(writeSetting('graphs', { window: 300 })).toBe('{"window":300}');
    expect(localStorage.getItem('cuxGauge.graphs')).toBe('{"window":300}');
    expect(readRawSetting('graphs')).toBe('{"window":300}');
    expect(
      parseRawSetting(readRawSetting('graphs'), (s) => asRecord(s)['window']),
    ).toBe(300);
  });

  it('gives the parser undefined when nothing, or nothing readable, is stored', () => {
    const parse = vi.fn(parseWindow);

    expect(parseRawSetting(null, parse)).toBe(60);
    expect(parseRawSetting(undefined, parse)).toBe(60);
    expect(parseRawSetting('{not json', parse)).toBe(60);
    expect(parse.mock.calls).toEqual([[undefined], [undefined], [undefined]]);
  });

  it('falls back to the default for values it does not recognise', () => {
    expect(parseRawSetting('45', parseWindow)).toBe(60);
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord(null)).toEqual({});
    expect(asRecord('text')).toEqual({});
  });

  it('works without storage', () => {
    blockStorage();

    expect(readRawSetting('window')).toBeUndefined();
    expect(writeSetting('window', 30)).toBeUndefined();
  });

  it('tells which changes in another window affect a setting', () => {
    const event = (key: string | null, storageArea: Storage = localStorage) =>
      new StorageEvent('storage', { key, storageArea });

    expect(affectsSetting(event('cuxGauge.graphs'), 'graphs')).toBe(true);
    // Cleared.
    expect(affectsSetting(event(null), 'graphs')).toBe(true);
    expect(affectsSetting(event('cuxGauge.readings'), 'graphs')).toBe(false);
    expect(affectsSetting(event('graphs'), 'graphs')).toBe(false);
    expect(
      affectsSetting(event('cuxGauge.graphs', sessionStorage), 'graphs'),
    ).toBe(false);
  });
});
