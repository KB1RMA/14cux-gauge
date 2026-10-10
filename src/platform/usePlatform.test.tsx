// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { render } from '@testing-library/react';
import { usePlatform } from './usePlatform';

function NeedsPlatform() {
  usePlatform();

  return null;
}

describe('usePlatform', () => {
  it('fails outside the app rather than running on the browser', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<NeedsPlatform />)).toThrow(
      'usePlatform must be used inside <PlatformContext>',
    );
  });
});
