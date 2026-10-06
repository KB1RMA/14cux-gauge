// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { FuelPumpContext, type FuelPumpValue } from './context';

export function useFuelPump(): FuelPumpValue {
  const value = use(FuelPumpContext);

  if (!value) {
    throw new Error('useFuelPump must be used inside <FuelPumpProvider>');
  }

  return value;
}
