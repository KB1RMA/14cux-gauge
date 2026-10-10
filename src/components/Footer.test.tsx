// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expectNoAxeViolations } from '../test-support/a11y';
import { TestServices } from '../test-support/TestApp';
import { Footer } from './Footer';

// The footer's log button reads the ECU state and its diagnostic log.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: TestServices });

const COMMIT = '2c918301a116bef99840db0951ce60d5159d8f53';

describe('Footer', () => {
  it('links a release build to its release and commit', () => {
    render(
      <Footer
        build={{ version: '0.1.0', commit: COMMIT, releaseTag: 'v0.1.0' }}
      />,
    );

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Release v0.1.0 (opens in a new tab), built from commit 2c91830 (opens in a new tab).',
    );
    expect(screen.getByRole('link', { name: /^v0\.1\.0/ })).toHaveAttribute(
      'href',
      'https://github.com/KB1RMA/14cux-gauge/releases/tag/v0.1.0',
    );
    expect(screen.getByRole('link', { name: /^2c91830/ })).toHaveAttribute(
      'href',
      'https://github.com/KB1RMA/14cux-gauge/commit/2c918301a116bef99840db0951ce60d5159d8f53',
    );
  });

  it('labels any other build as a development build', () => {
    render(
      <Footer build={{ version: '0.1.0', commit: COMMIT, releaseTag: null }} />,
    );

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Development build of 0.1.0, built from commit 2c91830 (opens in a new tab).',
    );
    expect(
      screen.queryByRole('link', { name: /^v0\.1\.0/ }),
    ).not.toBeInTheDocument();
  });

  it('leaves out the commit when the build had no git checkout', () => {
    render(
      <Footer build={{ version: '0.1.0', commit: null, releaseTag: null }} />,
    );

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Development build of 0.1.0.',
    );
    expect(
      screen.queryByRole('link', { name: /commit|^[0-9a-f]{7} / }),
    ).not.toBeInTheDocument();
  });

  it('offers the diagnostic log for download', () => {
    render(
      <Footer build={{ version: '0.1.0', commit: null, releaseTag: null }} />,
    );

    expect(
      screen.getByRole('button', { name: 'Download diagnostic log' }),
    ).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(
      <Footer
        build={{ version: '0.1.0', commit: COMMIT, releaseTag: 'v0.1.0' }}
      />,
    );

    await expectNoAxeViolations(container);
  });
});
