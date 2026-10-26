// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { SETTINGS, settingParser, type SettingKey } from './registry';

const defaults = { usageCounts: 'on' } as const;

describe('preferences', () => {
  const parse = settingParser('preferences', defaults);

  it('defaults to °F, mph, tiles, the system theme and Coniston, counting usage', () => {
    expect(parse(undefined)).toEqual({
      temperatureUnit: 'F',
      speedUnit: 'mph',
      theme: 'system',
      palette: 'coniston',
      gaugeStyle: 'tiles',
      usageCounts: 'on',
      keepScreenOn: false,
    });
  });

  it('reads each choice', () => {
    expect(
      parse({
        temperatureUnit: 'C',
        speedUnit: 'kmh',
        theme: 'dark',
        palette: 'racing-green',
        gaugeStyle: 'dials',
        usageCounts: 'off',
        keepScreenOn: true,
      }),
    ).toEqual({
      temperatureUnit: 'C',
      speedUnit: 'kmh',
      theme: 'dark',
      palette: 'racing-green',
      gaugeStyle: 'dials',
      usageCounts: 'off',
      keepScreenOn: true,
    });
  });

  it('keeps the screen on only when stored as true', () => {
    expect(parse({ keepScreenOn: 'yes' }).keepScreenOn).toBe(false);
    expect(parse({ keepScreenOn: 1 }).keepScreenOn).toBe(false);
  });

  it('keeps the default for values it does not recognise', () => {
    const unchosen = {
      temperatureUnit: 'F',
      speedUnit: 'mph',
      theme: 'system',
      palette: 'coniston',
      gaugeStyle: 'tiles',
      usageCounts: 'on',
      keepScreenOn: false,
    };

    expect(
      parse({
        temperatureUnit: 'K',
        theme: 'sepia',
        palette: 3,
        gaugeStyle: 'needles',
      }),
    ).toEqual(unchosen);
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

describe('dash', () => {
  const parse = settingParser('dash', defaults);

  it('shows engine speed, road speed, coolant, voltage and the MIL by default', () => {
    expect(parse(undefined)).toEqual({
      readings: [
        'engineRpm',
        'roadSpeedMph',
        'coolantTempF',
        'mainVoltage',
        'milOn',
      ],
    });
  });

  it('keeps only known readings, in display order, and keeps an empty choice', () => {
    expect(
      parse({ readings: ['milOn', 'warpDrive', 3, 'throttle', 'engineRpm'] }),
    ).toEqual({ readings: ['engineRpm', 'throttle', 'milOn'] });
    expect(parse({ readings: [] })).toEqual({ readings: [] });
  });

  it('uses the default list when the stored one is not a list', () => {
    expect(parse({ readings: 'engineRpm' }).readings).toHaveLength(5);
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

describe('every setting', () => {
  // Every setting, and every field of one, must have a default, so a value
  // stored by an older version (without a newer field), a newer version
  // (with fields this one does not know) or by hand always reads.
  const keys = Object.keys(SETTINGS) as SettingKey[];

  it.each(keys)('%s has a default when nothing usable is stored', (key) => {
    const parse = settingParser(key, defaults);
    const unset = parse(undefined);

    expect(unset).toBeDefined();
    expect(parse(null)).toEqual(unset);
    expect(parse('not a setting')).toEqual(unset);
    expect(parse(42)).toEqual(unset);
    expect(parse([])).toEqual(unset);
  });

  it.each(keys)('%s gives each missing field its default on its own', (key) => {
    const parse = settingParser(key, defaults);
    const unset = parse(undefined);

    // Settings that are not objects have no fields.
    if (typeof unset !== 'object') {
      return;
    }

    expect(parse({})).toEqual(unset);

    for (const field of Object.keys(unset)) {
      // Each field on its own, with garbage in every other field.
      const others = Object.fromEntries(
        Object.keys(unset)
          .filter((other) => other !== field)
          .map((other) => [other, { garbage: true }]),
      );

      expect(parse(others)).toEqual(unset);
    }
  });

  it.each(keys)('%s ignores fields a newer version stored', (key) => {
    const parse = settingParser(key, defaults);
    const unset = parse(undefined);

    if (typeof unset !== 'object') {
      return;
    }

    expect(parse({ ...unset, fromTheFuture: 'yes' })).toEqual(unset);
  });
});
