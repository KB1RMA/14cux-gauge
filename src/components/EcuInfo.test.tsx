// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryOffset, SimulatedTransport } from '@kb1rma/libcomm14cux-ts';
import { buildSyntheticRom } from '../demo/syntheticRom';
import { expectNoAxeViolations, readingFor } from '../test-support/a11y';
import { connectedSession } from '../test-support/ecuSession';
import { SessionHarness } from '../test-support/WriteHarness';
import { EcuInfo } from './EcuInfo';

async function infoWithRpmLimitPeriod(period: number) {
  const transport = new SimulatedTransport();

  transport.loadRom(buildSyntheticRom());
  transport.memory[MemoryOffset.RPMLimit] = period >> 8;
  transport.memory[MemoryOffset.RPMLimit + 1] = period & 0xff;

  const { session } = await connectedSession(transport);

  return (
    <SessionHarness session={session}>
      <EcuInfo />
    </SessionHarness>
  );
}

describe('EcuInfo', () => {
  it('shows the tune revision and the rev limit', async () => {
    const view = await infoWithRpmLimitPeriod(1500); // 7,500,000 / 1500 rpm

    const { container } = render(view);

    expect(await screen.findByText('5000 rpm')).toBeInTheDocument();
    expect(readingFor('Tune number')).toHaveTextContent('1234');
    expect(readingFor('Tune ident')).toHaveTextContent('0xDE70');
    expect(readingFor('Checksum fixer')).toHaveTextContent('0xA5');
    expect(readingFor('Rev limit')).toHaveTextContent('5000 rpm');
    await expectNoAxeViolations(container);
  });

  it('says so when the rev limit is not valid', async () => {
    const view = await infoWithRpmLimitPeriod(0);

    render(view);

    expect(await screen.findByText('Not valid')).toBeInTheDocument();
    expect(readingFor('Tune number')).toHaveTextContent('1234');
  });

  it('explains each fact on demand', async () => {
    const user = userEvent.setup();
    const view = await infoWithRpmLimitPeriod(1500);

    render(view);
    await screen.findByText('5000 rpm');

    for (const label of [
      'Tune number',
      'Tune ident',
      'Checksum fixer',
      'Rev limit',
    ]) {
      expect(
        screen.getByRole('button', { name: `About ${label}` }),
      ).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: 'About Rev limit' }));

    const info = screen.getByRole('dialog', { name: 'Rev limit' });

    expect(info).toHaveTextContent(/limits the engine to/);
    await expectNoAxeViolations(info);
  });
});
