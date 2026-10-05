// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, renderHook } from '@testing-library/react';
import {
  asRecord,
  oneOf,
  readSetting,
  removeSetting,
  writeSetting,
} from './settings';
import { useStoredState } from './useStoredState';

const parseWindow = (stored: unknown) => oneOf(stored, [30, 60, 300], 60);

function blockStorage() {
  const fail = () => {
    throw new DOMException('blocked', 'SecurityError');
  };

  return [
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail),
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail),
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(fail),
  ];
}

describe('settings', () => {
  it('stores JSON under the cuxGauge prefix and reads it back', () => {
    expect(writeSetting('graphs', { window: 300 })).toBe(true);
    expect(localStorage.getItem('cuxGauge.graphs')).toBe('{"window":300}');
    expect(readSetting('graphs', (s) => asRecord(s)['window'])).toBe(300);

    removeSetting('graphs');

    expect(localStorage.getItem('cuxGauge.graphs')).toBeNull();
  });

  it('gives the parser undefined when nothing, or nothing readable, is stored', () => {
    const parse = vi.fn(parseWindow);

    expect(readSetting('window', parse)).toBe(60);

    localStorage.setItem('cuxGauge.window', '{not json');

    expect(readSetting('window', parse)).toBe(60);
    expect(parse.mock.calls).toEqual([[undefined], [undefined]]);
  });

  it('falls back to the default for values it does not recognise', () => {
    localStorage.setItem('cuxGauge.window', '45');

    expect(readSetting('window', parseWindow)).toBe(60);
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord(null)).toEqual({});
    expect(asRecord('text')).toEqual({});
  });

  it('works without storage', () => {
    const spies = blockStorage();

    expect(readSetting('window', parseWindow)).toBe(60);
    expect(writeSetting('window', 30)).toBe(false);
    expect(() => {
      removeSetting('window');
    }).not.toThrow();

    spies.forEach((spy) => {
      spy.mockRestore();
    });
  });
});

describe('useStoredState', () => {
  it('loads the stored value and saves every change', () => {
    localStorage.setItem('cuxGauge.window', '300');

    const { result, unmount } = renderHook(() =>
      useStoredState('window', parseWindow),
    );

    expect(result.current[0]).toBe(300);

    act(() => {
      result.current[1](30);
    });

    expect(result.current[0]).toBe(30);
    expect(localStorage.getItem('cuxGauge.window')).toBe('30');

    act(() => {
      result.current[1]((previous) => (previous === 30 ? 60 : 30));
    });

    expect(localStorage.getItem('cuxGauge.window')).toBe('60');
    unmount();

    const again = renderHook(() => useStoredState('window', parseWindow));

    expect(again.result.current[0]).toBe(60);
  });

  it('still updates for this visit when storage is blocked', () => {
    const spies = blockStorage();
    const { result } = renderHook(() => useStoredState('window', parseWindow));

    act(() => {
      result.current[1](300);
    });

    expect(result.current[0]).toBe(300);
    spies.forEach((spy) => {
      spy.mockRestore();
    });
  });
});
