// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { blockStorage } from '../test-support/storage';
import { useSetting } from './useSetting';

/** Shows the graph window, and switches it between 1 and 5 minutes. */
function WindowButton({ view }: { view: string }) {
  const [graphs, setGraphs] = useSetting('graphs');

  return (
    <button
      type="button"
      onClick={() => {
        setGraphs((previous) => ({
          ...previous,
          window: previous.window === 60 ? 300 : 60,
        }));
      }}
    >
      {view}: {graphs.window} s
    </button>
  );
}

/** As another window of the app would change the setting. */
function changeInAnotherWindow(key: string, value: string | null) {
  act(() => {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }

    window.dispatchEvent(
      new StorageEvent('storage', {
        key,
        newValue: value,
        storageArea: localStorage,
      }),
    );
  });
}

describe('useSetting', () => {
  it('loads the stored value and saves every change', () => {
    localStorage.setItem('cuxGauge.graphs', '{"window":300}');

    const { result, unmount } = renderHook(() => useSetting('graphs'));

    expect(result.current[0]).toEqual({
      window: 300,
      layout: 'grid',
      hidden: [],
    });

    act(() => {
      result.current[1]({ window: 30, layout: 'stacked', hidden: [] });
    });

    expect(result.current[0].window).toBe(30);
    expect(localStorage.getItem('cuxGauge.graphs')).toBe(
      '{"window":30,"layout":"stacked","hidden":[]}',
    );
    unmount();

    const again = renderHook(() => useSetting('graphs'));

    expect(again.result.current[0].layout).toBe('stacked');
  });

  it('shares one value between every component using it', async () => {
    const user = userEvent.setup();

    render(
      <>
        <WindowButton view="Live" />
        <WindowButton view="Replay" />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Live: 60 s' }));

    expect(screen.getByRole('button', { name: 'Live: 300 s' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Replay: 300 s' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Replay: 300 s' }));

    expect(screen.getByRole('button', { name: 'Live: 60 s' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Replay: 60 s' })).toBeVisible();
  });

  it('follows a change made in another window', () => {
    render(<WindowButton view="Live" />);

    changeInAnotherWindow('cuxGauge.graphs', '{"window":600}');

    expect(screen.getByRole('button', { name: 'Live: 600 s' })).toBeVisible();

    // Another setting changing leaves this one alone.
    changeInAnotherWindow('cuxGauge.doubleSpeed', 'true');

    expect(screen.getByRole('button', { name: 'Live: 600 s' })).toBeVisible();

    changeInAnotherWindow('cuxGauge.graphs', null);

    expect(screen.getByRole('button', { name: 'Live: 60 s' })).toBeVisible();
  });

  it('runs an update once, even when React renders twice to check', async () => {
    const user = userEvent.setup();
    const update = vi.fn((previous: boolean) => !previous);

    function DoubleSpeed() {
      const [on, setOn] = useSetting('doubleSpeed');

      return (
        <button
          type="button"
          onClick={() => {
            setOn(update);
          }}
        >
          Double speed {on ? 'on' : 'off'}
        </button>
      );
    }

    render(
      <StrictMode>
        <DoubleSpeed />
      </StrictMode>,
    );
    await user.click(screen.getByRole('button', { name: 'Double speed off' }));

    expect(
      screen.getByRole('button', { name: 'Double speed on' }),
    ).toBeVisible();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('still changes while in use when storage is blocked', async () => {
    const user = userEvent.setup();
    const restore = blockStorage();
    const { unmount } = render(<WindowButton view="Live" />);

    await user.click(screen.getByRole('button', { name: 'Live: 60 s' }));

    expect(screen.getByRole('button', { name: 'Live: 300 s' })).toBeVisible();

    // Not kept once nothing shows it, as storage could not keep it.
    unmount();
    render(<WindowButton view="Live" />);

    expect(screen.getByRole('button', { name: 'Live: 60 s' })).toBeVisible();
    restore();
  });

  it('keeps a change storage has no room for, until storage changes', async () => {
    const user = userEvent.setup();

    render(<WindowButton view="Live" />);

    const full = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });

    await user.click(screen.getByRole('button', { name: 'Live: 60 s' }));

    expect(screen.getByRole('button', { name: 'Live: 300 s' })).toBeVisible();
    expect(localStorage.getItem('cuxGauge.graphs')).toBeNull();

    full.mockRestore();
    changeInAnotherWindow('cuxGauge.graphs', '{"window":30}');

    expect(screen.getByRole('button', { name: 'Live: 30 s' })).toBeVisible();
  });
});
