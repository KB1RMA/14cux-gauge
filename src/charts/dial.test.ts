// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { METRICS, type DisplayUnits, type MetricKey } from '../metrics';
import {
  arcPath,
  dialAngle,
  dialBands,
  dialCaption,
  dialFraction,
  dialLabel,
  dialTicks,
  polar,
} from './dial';

const IMPERIAL: DisplayUnits = { temperatureUnit: 'F', speedUnit: 'mph' };
const METRIC: DisplayUnits = { temperatureUnit: 'C', speedUnit: 'kmh' };

function metric(key: MetricKey) {
  const found = METRICS.find((m) => m.key === key);

  if (!found) {
    throw new Error(`No metric ${key}`);
  }

  return found;
}

function scaleOf(key: MetricKey, units: DisplayUnits) {
  const scale = metric(key).dial?.(units);

  if (!scale) {
    throw new Error(`No dial for ${key}`);
  }

  return scale;
}

/** The labelled ticks' text, as the dial shows them. */
function labels(key: MetricKey, units: DisplayUnits): string[] {
  const scale = scaleOf(key, units);

  return dialTicks(scale)
    .filter((tick) => tick.labelled)
    .map((tick) => dialLabel(metric(key), scale, tick.value));
}

describe('dial geometry', () => {
  it('sweeps 270° clockwise from bottom left, open at the bottom', () => {
    expect(dialAngle(0)).toBe(-135);
    expect(dialAngle(0.5)).toBe(0);
    expect(dialAngle(1)).toBe(135);
  });

  it('places a value on the scale in proportion to the range', () => {
    expect(dialFraction([0, 7000], 0)).toBe(0);
    expect(dialFraction([0, 7000], 3500)).toBe(0.5);
    expect(dialFraction([0, 7000], 750)).toBeCloseTo(0.107143, 6);
    expect(dialFraction([-40, 280], -40)).toBe(0);
    expect(dialFraction([-40, 280], 0)).toBe(0.125);
    expect(dialFraction([-40, 280], 280)).toBe(1);
  });

  it('stops the needle at the end of the scale for a value off it', () => {
    expect(dialFraction([0, 7000], 7001)).toBe(1);
    expect(dialFraction([0, 7000], 9000)).toBe(1);
    expect(dialFraction([-40, 140], -41)).toBe(0);
  });

  it('measures points clockwise from straight up', () => {
    const [upX, upY] = polar([50, 50], 10, 0);
    const [rightX, rightY] = polar([50, 50], 10, 90);
    const [downX, downY] = polar([50, 50], 10, 180);
    const [leftX, leftY] = polar([50, 50], 10, -90);

    expect([upX, upY]).toEqual([50, 40]);
    expect(rightX).toBeCloseTo(60, 10);
    expect(rightY).toBeCloseTo(50, 10);
    expect(downX).toBeCloseTo(50, 10);
    expect(downY).toBeCloseTo(60, 10);
    expect(leftX).toBeCloseTo(40, 10);
    expect(leftY).toBeCloseTo(50, 10);
  });

  it('draws arcs over 180° the long way round', () => {
    expect(arcPath([50, 50], 10, 0, 90)).toMatch(
      /^M 50 40 A 10 10 0 0 1 60 50(\.\d+)?$/,
    );
    expect(arcPath([50, 50], 10, -135, 135)).toMatch(/ 0 1 1 /);
  });
});

describe('dial scales', () => {
  it('labels engine speed in thousands of rpm', () => {
    const scale = scaleOf('engineRpm', IMPERIAL);

    expect(labels('engineRpm', IMPERIAL)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
    expect(dialCaption(metric('engineRpm'), scale, IMPERIAL)).toBe('×1000 rpm');
    // The same in either unit system.
    expect(labels('engineRpm', METRIC)).toEqual(labels('engineRpm', IMPERIAL));
  });

  it('puts an unlabelled tick halfway between each labelled one', () => {
    expect(dialTicks(scaleOf('engineRpm', IMPERIAL))).toHaveLength(15);
    expect(
      dialTicks(scaleOf('engineRpm', IMPERIAL))
        .slice(0, 3)
        .map(({ value, labelled }) => [value, labelled]),
    ).toEqual([
      [0, true],
      [500, false],
      [1000, true],
    ]);
  });

  it('labels road speed on round steps in the chosen unit', () => {
    expect(labels('roadSpeedMph', IMPERIAL)).toEqual([
      '0',
      '20',
      '40',
      '60',
      '80',
      '100',
      '120',
      '140',
      '160',
    ]);
    expect(labels('roadSpeedMph', METRIC)).toEqual([
      '0',
      '40',
      '80',
      '120',
      '160',
      '200',
      '240',
      '280',
    ]);
    expect(
      dialCaption(
        metric('roadSpeedMph'),
        scaleOf('roadSpeedMph', IMPERIAL),
        IMPERIAL,
      ),
    ).toBe('mph');
    expect(
      dialCaption(
        metric('roadSpeedMph'),
        scaleOf('roadSpeedMph', METRIC),
        METRIC,
      ),
    ).toBe('km/h');
  });

  it('labels temperatures below freezing in both scales', () => {
    for (const key of ['coolantTempF', 'fuelTempF'] as const) {
      expect(labels(key, IMPERIAL)).toEqual([
        '-40',
        '0',
        '40',
        '80',
        '120',
        '160',
        '200',
        '240',
        '280',
      ]);
      expect(labels(key, METRIC)).toEqual([
        '-40',
        '-20',
        '0',
        '20',
        '40',
        '60',
        '80',
        '100',
        '120',
        '140',
      ]);
      expect(dialCaption(metric(key), scaleOf(key, IMPERIAL), IMPERIAL)).toBe(
        '°F',
      );
      expect(dialCaption(metric(key), scaleOf(key, METRIC), METRIC)).toBe('°C');
    }
  });

  it('offers dials for engine speed, road speed and the temperatures only', () => {
    expect(
      METRICS.filter((m) => m.dial !== undefined).map((m) => m.key),
    ).toEqual(['engineRpm', 'roadSpeedMph', 'coolantTempF', 'fuelTempF']);
  });
});

describe('dial bands', () => {
  it("draws coolant's hot and overheating levels, from 221 °F and 239 °F", () => {
    const coolant = metric('coolantTempF');
    const bands = dialBands(
      coolant,
      scaleOf('coolantTempF', IMPERIAL),
      IMPERIAL,
    );

    // (221 + 40) / 320 and (239 + 40) / 320 of the way round.
    expect(bands).toEqual([
      { from: 0.815625, to: 0.871875, tone: 'warn' },
      { from: 0.871875, to: 1, tone: 'alert' },
    ]);
  });

  it('draws the same levels at 105 °C and 115 °C', () => {
    const bands = dialBands(
      metric('coolantTempF'),
      scaleOf('coolantTempF', METRIC),
      METRIC,
    );

    // (105 + 40) / 180 and (115 + 40) / 180 of the way round.
    expect(bands.map((band) => band.tone)).toEqual(['warn', 'alert']);
    expect(bands[0]?.from).toBeCloseTo(0.805556, 6);
    expect(bands[0]?.to).toBeCloseTo(0.861111, 6);
    expect(bands[1]?.from).toBeCloseTo(0.861111, 6);
    expect(bands[1]?.to).toBe(1);
  });

  it('draws no bands for a reading without thresholds', () => {
    for (const key of ['engineRpm', 'roadSpeedMph', 'fuelTempF'] as const) {
      expect(dialBands(metric(key), scaleOf(key, IMPERIAL), IMPERIAL)).toEqual(
        [],
      );
    }
  });

  it('leaves out a band that falls off the scale', () => {
    const coolant = metric('coolantTempF');

    expect(dialBands(coolant, { range: [0, 200], step: 40 }, IMPERIAL)).toEqual(
      [],
    );
    expect(dialBands(coolant, { range: [0, 230], step: 10 }, IMPERIAL)).toEqual(
      [{ from: 221 / 230, to: 1, tone: 'warn' }],
    );
  });
});
