// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { renderHook } from '@testing-library/react';
import { useHistory } from './useHistory';

describe('useHistory', () => {
  it('must be used inside the ECU provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => renderHook(() => useHistory())).toThrow(
      'useHistory must be used inside <EcuProvider>',
    );
    error.mockRestore();
  });
});
