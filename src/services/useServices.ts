// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import type { AppServices } from '../appServices';
import { ServicesContext } from './context';

/** The app's controllers, for the hooks built on them. */
export function useServices(): AppServices {
  const services = use(ServicesContext);

  if (!services) {
    throw new Error('Hooks must be used inside <ServicesProvider>');
  }

  return services;
}
