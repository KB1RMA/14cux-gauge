// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import type { WriteLogEntry } from '../ecuWrite/writes';
import { useReplay } from '../replay/useReplay';
import { expectNoAxeViolations } from '../test-support/a11y';
import { snapshotAt } from '../test-support/snapshots';
import { WriteLog } from './WriteLog';

const START = 1_700_000_000_000;
const SAMPLES = [snapshotAt(START), snapshotAt(START + 5000)];

function Log({
  writes,
  keepsWrites,
}: {
  writes: readonly WriteLogEntry[];
  keepsWrites: boolean;
}) {
  const replay = useReplay(SAMPLES);

  return (
    <main>
      <WriteLog
        writes={writes}
        keepsWrites={keepsWrites}
        firstSampleAt={START}
        replay={replay}
      />
    </main>
  );
}

describe('WriteLog', () => {
  it('says when no writes were made', async () => {
    const { container } = render(<Log writes={[]} keepsWrites />);

    expect(
      screen.getByText('No writes to the ECU were made during this recording.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says when a session was recorded before writes were kept', () => {
    render(<Log writes={[]} keepsWrites={false} />);

    expect(
      screen.getByText(
        'This session was recorded before writes to the ECU were kept, so any made during it are not shown.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a write that began before the first sample, under the playhead', async () => {
    const { container } = render(
      <Log
        writes={[
          {
            id: 'w',
            write: 'idleAirControl',
            startedAt: START - 300,
            endedAt: START + 900,
            outcome: { status: 'done', message: 'Commanded 10 steps open.' },
          },
        ]}
        keepsWrites
      />,
    );

    expect(
      screen.getByRole('rowheader', {
        name: 'Idle air control test At the playhead',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Before the first sample')).toBeInTheDocument();
    expect(screen.getByText('1.2 s')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Go to Idle air control test, at the first sample',
      }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
