// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render } from '@testing-library/react';
import { METRICS, type DisplayUnits } from '../metrics';
import { Dial } from './Dial';

const IMPERIAL: DisplayUnits = { temperatureUnit: 'F', speedUnit: 'mph' };
const COOLANT = METRICS.find((m) => m.key === 'coolantTempF');
const SCALE = COOLANT?.dial?.(IMPERIAL);

function renderDial(display: number | null | undefined) {
  if (!COOLANT || !SCALE) {
    throw new Error('Coolant has no dial');
  }

  return render(
    <Dial metric={COOLANT} scale={SCALE} units={IMPERIAL} display={display} />,
  );
}

/** The dial as drawn for `display`. */
function drawn(display: number | null | undefined): string {
  return renderDial(display).container.innerHTML;
}

/**
 * The needle as drawn for `display`: where its tip is, in the dial's
 * 100-wide drawing, and whether an arrowhead past the end shows it is
 * stopped there. `undefined` when no needle is drawn.
 */
function needle(display: number | null | undefined) {
  const { container } = renderDial(display);
  // The needle is the drawing's only group; the face's lines are not in one.
  const line = container.querySelector('svg g line');

  if (!line) {
    return undefined;
  }

  return {
    tip: [Number(line.getAttribute('x2')), Number(line.getAttribute('y2'))],
    arrowhead: container.querySelector('svg g path') !== null,
  };
}

describe('Dial', () => {
  it('is hidden from assistive tech, and adds no text to the reading', () => {
    const { container } = renderDial(180);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    // The scale's labels are drawn by CSS, so they are not part of the
    // reading's text.
    expect(container).toHaveTextContent(/^$/);
  });

  it('draws an invalid reading as no needle, not as the low end', () => {
    expect(needle(null)).toBeUndefined();
    expect(needle(undefined)).toBeUndefined();
    // -40 °F is the scale's low end, and does draw a needle.
    expect(needle(-40)).toBeDefined();
    expect(drawn(null)).toBe(drawn(undefined));
  });

  it('points the needle at the reading', () => {
    // 180 °F is (180 + 40) / 320 = 0.6875 of the way round, at
    // -135° + 0.6875 × 270° = 50.625° from straight up. The 40-long needle
    // from the centre (50, 50) ends at (50 + 40 sin 50.625°,
    // 50 − 40 cos 50.625°).
    const at180 = needle(180);

    expect(at180?.tip[0]).toBeCloseTo(80.92, 2);
    expect(at180?.tip[1]).toBeCloseTo(24.624, 2);
    expect(at180?.arrowhead).toBe(false);
    // 280 °F, the high end, at 135°: (50 + 40 sin 135°, 50 − 40 cos 135°).
    expect(needle(280)?.tip[0]).toBeCloseTo(78.284, 2);
    expect(needle(280)?.tip[1]).toBeCloseTo(78.284, 2);
    expect(needle(280)?.arrowhead).toBe(false);
  });

  it('stops the needle at the end for a reading off the scale, and says so', () => {
    const over = needle(300);

    // At the end, as 280 °F is...
    expect(over?.tip[0]).toBeCloseTo(78.284, 2);
    expect(over?.tip[1]).toBeCloseTo(78.284, 2);
    // ...but with an arrowhead past the end, so it does not read as 280 °F.
    expect(over?.arrowhead).toBe(true);
    expect(drawn(300)).not.toBe(drawn(280));
    // Below the low end too: -41 °F, at -135°.
    const under = needle(-41);

    expect(under?.tip[0]).toBeCloseTo(21.716, 2);
    expect(under?.tip[1]).toBeCloseTo(78.284, 2);
    expect(under?.arrowhead).toBe(true);
  });
});
