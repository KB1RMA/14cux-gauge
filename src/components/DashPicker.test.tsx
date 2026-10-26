// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expectNoAxeViolations } from '../test-support/a11y';
import { DashPicker } from './DashPicker';

function renderPicker(chosen: Parameters<typeof DashPicker>[0]['chosen']) {
  const onChange = vi.fn();

  render(<DashPicker chosen={chosen} onChange={onChange} />);

  return onChange;
}

describe('DashPicker', () => {
  it('says how many readings are on the dash', () => {
    renderPicker(['engineRpm', 'milOn']);

    expect(
      screen.getByRole('button', { name: /Choose dash readings/ }),
    ).toHaveTextContent('2 of 25');
  });

  it('adds a reading in display order and removes one', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker(['milOn', 'engineRpm']);

    await user.click(
      screen.getByRole('button', { name: /Choose dash readings/ }),
    );
    await expectNoAxeViolations(
      screen.getByRole('dialog', { name: 'Readings on the dash' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Coolant' }));

    expect(onChange).toHaveBeenLastCalledWith([
      'engineRpm',
      'coolantTempF',
      'milOn',
    ]);

    await user.click(screen.getByRole('checkbox', { name: 'Engine speed' }));

    expect(onChange).toHaveBeenLastCalledWith(['milOn']);
  });

  it('offers the default list and an empty one', async () => {
    const user = userEvent.setup();
    const onChange = renderPicker(['throttle']);

    await user.click(
      screen.getByRole('button', { name: /Choose dash readings/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Default' }));

    expect(onChange).toHaveBeenLastCalledWith([
      'engineRpm',
      'roadSpeedMph',
      'coolantTempF',
      'mainVoltage',
      'milOn',
    ]);

    await user.click(screen.getByRole('button', { name: 'None' }));

    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
