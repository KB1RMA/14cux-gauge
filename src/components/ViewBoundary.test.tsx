// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy, type ReactNode } from 'react';
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router';
import { expectNoAxeViolations } from '../test-support/a11y';
import { testPlatform } from '../test-support/platform';
import { TestServices } from '../test-support/TestApp';
import { ConnectScreen } from './ConnectScreen';
import { ViewBoundary } from './ViewBoundary';

function Broken(): never {
  throw new Error('Cannot read properties of undefined');
}

/**
 * `view` in a boundary, beside the rest of the app and a connect screen that
 * can connect the demo ECU.
 */
function renderView(view: ReactNode, reload: () => void = () => {}) {
  return render(
    <MemoryRouter>
      <TestServices
        platform={testPlatform({
          app: { userAgent: 'TestBrowser/1.0', reload },
        })}
        pollIntervalMs={{ demo: 10 }}
      >
        <p>The app bar</p>
        <ConnectScreen />
        <ViewBoundary>{view}</ViewBoundary>
      </TestServices>
    </MemoryRouter>,
  );
}

describe('ViewBoundary', () => {
  beforeEach(() => {
    // React reports the error it caught; it is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says it is loading a view, then shows it', async () => {
    let loaded: (view: { default: () => ReactNode }) => void = () => {};

    const View = lazy(
      () =>
        new Promise<{ default: () => ReactNode }>((resolve) => {
          loaded = resolve;
        }),
    );

    renderView(<View />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();

    loaded({ default: () => <h2>Live data</h2> });

    expect(
      await screen.findByRole('heading', { name: 'Live data' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('replaces a view that fails, says why, and focuses its heading', async () => {
    const { container } = renderView(<Broken />);
    const heading = screen.getByRole('heading', {
      name: 'This view could not be shown',
    });

    expect(heading).toHaveFocus();
    expect(
      screen.getByRole('region', { name: 'This view could not be shown' }),
    ).toHaveTextContent(
      'If you are offline or a newer version of the app has been published, part of it may not have downloaded. Open another view, or reload the page to try again.Error: Cannot read properties of undefined',
    );
    expect(screen.getByText('The app bar')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('replaces a view whose code cannot be downloaded', async () => {
    const View = lazy(() =>
      Promise.reject(
        new TypeError('Failed to fetch dynamically imported module'),
      ),
    );

    renderView(<View />);

    expect(
      await screen.findByRole('region', {
        name: 'This view could not be shown',
      }),
    ).toHaveTextContent('Error: Failed to fetch dynamically imported module');
    expect(screen.getByText('The app bar')).toBeInTheDocument();
  });

  it('says what was thrown when it is not an Error', () => {
    function ThrowsText(): never {
      throw 'Lost the ECU link';
    }

    renderView(<ThrowsText />);

    expect(
      screen.getByRole('region', { name: 'This view could not be shown' }),
    ).toHaveTextContent('Error: Lost the ECU link');
  });

  it('tries again when the user opens another page of the same view', async () => {
    const user = userEvent.setup();

    /** A tabbed view whose fuel map page fails. */
    function Tab() {
      const { tab } = useParams();

      if (tab === 'fuel-map') {
        throw new Error('Cannot read properties of undefined');
      }

      return <h2>Overview</h2>;
    }

    render(
      <MemoryRouter initialEntries={['/fuel-map']}>
        <TestServices>
          <Link to="/overview">Live</Link>
          <Routes>
            <Route
              path="/:tab"
              element={
                <ViewBoundary>
                  <Tab />
                </ViewBoundary>
              }
            />
          </Routes>
        </TestServices>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'This view could not be shown' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Live' }));

    expect(
      screen.getByRole('heading', { name: 'Overview' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'This view could not be shown' }),
    ).not.toBeInTheDocument();
  });

  it('reloads at once when nothing is connected', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();

    renderView(<Broken />, reload);
    await user.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('asks before reloading away from a connected ECU', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();

    renderView(<Broken />, reload);
    await user.click(screen.getByRole('button', { name: 'Demo mode' }));
    await user.click(screen.getByRole('button', { name: 'Reload' }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Reload the page?',
    });

    expect(dialog).toHaveTextContent(
      'Reloading closes the connection to the ECU and ends any recording in progress.',
    );
    await expectNoAxeViolations(dialog);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(reload).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    await user.click(
      screen.getByRole('button', { name: 'Reload and disconnect' }),
    );

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
