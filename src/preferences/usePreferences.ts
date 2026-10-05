// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { PreferencesContext, type PreferencesContextValue } from './context';

export function usePreferences(): PreferencesContextValue {
  const value = use(PreferencesContext);

  if (!value) {
    throw new Error('usePreferences must be used inside <PreferencesProvider>');
  }

  return value;
}
