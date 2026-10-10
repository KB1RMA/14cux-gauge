// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { choice, parseRawSetting } from './parseSetting';

const parseWindow = (stored: unknown) =>
  choice([30, 60, 300], 60).parse(stored);

describe('parseRawSetting', () => {
  it('parses stored JSON', () => {
    expect(parseRawSetting('300', parseWindow)).toBe(300);
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
  });
});
