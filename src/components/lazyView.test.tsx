// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { act, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { MemoryRouter } from 'react-router';
import { TestServices } from '../test-support/TestApp';
import { lazyView } from './lazyView';
import { ViewBoundary } from './ViewBoundary';

function LiveData({ title }: { title: string }) {
  return <h2>{title}</h2>;
}

/** A view whose code arrives when the test says so. */
function deferredView() {
  let arrive: (component: ComponentType<{ title: string }>) => void = () => {};

  let fail: (error: Error) => void = () => {};

  const view = lazyView(
    () =>
      new Promise<ComponentType<{ title: string }>>((resolve, reject) => {
        arrive = resolve;
        fail = reject;
      }),
  );

  return {
    ...view,
    arrive: (component: ComponentType<{ title: string }>) => {
      arrive(component);
    },
    fail: (error: Error) => {
      fail(error);
    },
  };
}

function renderView(View: ComponentType<{ title: string }>) {
  return render(
    <MemoryRouter>
      <TestServices>
        <ViewBoundary>
          <View title="Live data" />
        </ViewBoundary>
      </TestServices>
    </MemoryRouter>,
  );
}

describe('lazyView', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a preloaded view at once, without "Loading…"', async () => {
    const { View, preload, arrive } = deferredView();
    const loading = preload();

    arrive(LiveData);
    await loading;
    renderView(View);

    // Rendered in the same pass: nothing waits on a retry.
    expect(screen.getByRole('heading', { name: 'Live data' })).toBeVisible();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('says it is loading a view still downloading, then shows it', async () => {
    const { View, arrive } = deferredView();

    renderView(View);

    expect(screen.getByText('Loading…')).toBeInTheDocument();

    await act(async () => {
      arrive(LiveData);
      await Promise.resolve();
    });

    expect(
      await screen.findByRole('heading', { name: 'Live data' }),
    ).toBeVisible();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('shows the view if a preload finishes while it is loading', async () => {
    const { View, preload, arrive } = deferredView();

    renderView(View);

    expect(screen.getByText('Loading…')).toBeInTheDocument();

    await act(async () => {
      const loading = preload();

      arrive(LiveData);
      await loading;
    });

    expect(screen.getByRole('heading', { name: 'Live data' })).toBeVisible();
  });

  it('tries again when shown if an early preload failed', async () => {
    const { View, preload, arrive, fail } = deferredView();
    const early = preload();

    fail(new TypeError('Failed to fetch dynamically imported module'));
    await expect(early).rejects.toThrow('Failed to fetch');
    renderView(View);

    expect(screen.getByText('Loading…')).toBeInTheDocument();

    await act(async () => {
      arrive(LiveData);
      await Promise.resolve();
    });

    expect(
      await screen.findByRole('heading', { name: 'Live data' }),
    ).toBeVisible();
  });

  it('says so when the view’s code cannot be downloaded', async () => {
    // React reports the error it caught; it is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { View, fail } = deferredView();

    renderView(View);
    fail(new TypeError('Failed to fetch dynamically imported module'));

    expect(
      await screen.findByRole('region', {
        name: 'This view could not be shown',
      }),
    ).toHaveTextContent('Error: Failed to fetch dynamically imported module');
  });
});
