// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { settingParser } from './registry';

const defaults = { usageCounts: 'on' } as const;

describe('preferences', () => {
  const parse = settingParser('preferences', defaults);

  it('defaults to °F, mph, the system theme and Coniston, counting usage', () => {
    expect(parse(undefined)).toEqual({
      temperatureUnit: 'F',
      speedUnit: 'mph',
      theme: 'system',
      palette: 'coniston',
      usageCounts: 'on',
    });
  });

  it('reads each choice', () => {
    expect(
      parse({
        temperatureUnit: 'C',
        speedUnit: 'kmh',
        theme: 'dark',
        palette: 'racing-green',
        usageCounts: 'off',
      }),
    ).toEqual({
      temperatureUnit: 'C',
      speedUnit: 'kmh',
      theme: 'dark',
      palette: 'racing-green',
      usageCounts: 'off',
    });
  });

  it('keeps the default for values it does not recognise', () => {
    const unchosen = {
      temperatureUnit: 'F',
      speedUnit: 'mph',
      theme: 'system',
      palette: 'coniston',
      usageCounts: 'on',
    };

    expect(parse({ temperatureUnit: 'K', theme: 'sepia', palette: 3 })).toEqual(
      unchosen,
    );
    expect(parse(['F'])).toEqual(unchosen);
  });

  it('counts usage unless the platform defaults to not counting', () => {
    const quiet = settingParser('preferences', { usageCounts: 'off' });

    expect(quiet(undefined).usageCounts).toBe('off');
    expect(quiet({ usageCounts: 'on' }).usageCounts).toBe('on');
  });
});

describe('readings', () => {
  const parse = settingParser('readings', defaults);

  it('reads everything by default', () => {
    expect(parse(undefined)).toEqual({ off: [] });
  });

  it('keeps only known readings, and never turns the MIL off', () => {
    expect(parse({ off: ['fuelTempF', 'milOn', 'warpDrive', 3] })).toEqual({
      off: ['fuelTempF'],
    });
    expect(parse({ off: 'fuelTempF' })).toEqual({ off: [] });
  });
});

describe('graphs', () => {
  const parse = settingParser('graphs', defaults);

  it('defaults to a one-minute window in a grid', () => {
    expect(parse(undefined)).toEqual({
      window: 60,
      layout: 'grid',
      hidden: [],
    });
  });

  it('reads the window, including the session, and the layout', () => {
    expect(
      parse({ window: 'session', layout: 'stacked', hidden: ['throttle'] }),
    ).toEqual({ window: 'session', layout: 'stacked', hidden: ['throttle'] });
  });

  it('reads the window an earlier version stored', () => {
    expect(parse({ windowSeconds: 600 }).window).toBe(600);
  });

  it('ignores values it does not recognise', () => {
    expect(parse({ window: 45, layout: 'masonry', hidden: ['x'] })).toEqual({
      window: 60,
      layout: 'grid',
      hidden: [],
    });
  });
});

describe('doubleSpeed', () => {
  it('is off unless true is stored', () => {
    const parse = settingParser('doubleSpeed', defaults);

    expect(parse(undefined)).toBe(false);
    expect(parse('true')).toBe(false);
    expect(parse(true)).toBe(true);
  });
});
