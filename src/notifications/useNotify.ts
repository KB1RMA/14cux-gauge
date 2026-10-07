// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { use } from 'react';
import { NotificationsContext, type NotificationsValue } from './context';

export function useNotify(): NotificationsValue['notify'] {
  const value = use(NotificationsContext);

  if (!value) {
    throw new Error('useNotify must be used inside <NotificationsProvider>');
  }

  return value.notify;
}
