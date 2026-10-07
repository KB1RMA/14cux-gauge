// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, waitFor } from '@testing-library/react';
import { useHistory } from '../history/useHistory';
import type { SampleHistory } from '../history/sampleHistory';
import type { MetricKey } from '../metrics';
import { EcuProvider } from './EcuProvider';
import type { EcuContextValue } from './contexts';
import { useEcu } from './useEcu';

function Probe({
  onValue,
}: {
  onValue(ecu: EcuContextValue, history: SampleHistory<MetricKey>): void;
}) {
  const ecu = useEcu();
  const { history } = useHistory();

  onValue(ecu, history);

  return null;
}

describe('pausing polling', () => {
  it('marks the pause in the history, so graphs break the line there', async () => {
    let ecu: EcuContextValue | undefined;
    let history: SampleHistory<MetricKey> | undefined;

    render(
      <EcuProvider pollIntervalMs={{ demo: 5 }}>
        <Probe
          onValue={(nextEcu, nextHistory) => {
            ecu = nextEcu;
            history = nextHistory;
          }}
        />
      </EcuProvider>,
    );

    await act(async () => {
      await ecu?.connect({ kind: 'demo' });
    });
    await waitFor(() => {
      expect(history?.window('engineRpm').values.length).toBeGreaterThan(2);
    });

    let resume: (() => void) | undefined;

    await act(async () => {
      resume = await ecu?.pausePolling();
    });

    const paused = history?.window('engineRpm').values ?? [];

    expect(paused.at(-1)).toBeNull();
    expect(paused.at(-2)).not.toBeNull();

    await act(async () => {
      resume?.();
      await waitFor(() => {
        expect(history?.window('engineRpm').values.at(-1)).not.toBeNull();
      });
    });

    const resumed = history?.window('engineRpm').values ?? [];

    // The invalid sample is still there, between the readings either side.
    expect(resumed).toContain(null);
    await act(async () => {
      await ecu?.disconnect();
    });
  });
});
