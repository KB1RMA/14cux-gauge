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

describe('Dial', () => {
  it('is hidden from assistive tech, and adds no text to the reading', () => {
    const { container } = renderDial(180);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    // The scale's labels are drawn by CSS, so they are not part of the
    // reading's text.
    expect(container).toHaveTextContent(/^$/);
  });

  it('draws an invalid reading as no needle, not as the low end', () => {
    // -40 °F is the scale's low end.
    expect(drawn(null)).not.toBe(drawn(-40));
    expect(drawn(null)).toBe(drawn(undefined));
  });

  it('moves the needle with the reading, and stops it at the end', () => {
    expect(drawn(180)).not.toBe(drawn(181));
    // 280 °F is the scale's high end; the text beside it shows the reading.
    expect(drawn(300)).toBe(drawn(280));
  });
});
