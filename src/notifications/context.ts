// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { createContext } from 'react';

/**
 * `progress` stays until it is replaced, as something still under way must
 * not disappear; `success` closes itself; `error` stays until dismissed.
 */
export type NotificationTone = 'progress' | 'success' | 'error';

export interface NotificationInput {
  /**
   * Notifications with the same key are about the same thing: a new one
   * replaces the last, as a write's outcome replaces its "running" notice.
   */
  key: string;
  tone: NotificationTone;
  /** What it is about, such as the write's name. */
  title: string;
  /** What happened, as a sentence. */
  message: string;
}

export interface Notification extends NotificationInput {
  /** Unique to this notification, so a replacement is announced afresh. */
  id: number;
  /** False once dismissed or replaced, while it animates away. */
  open: boolean;
}

export interface NotificationsValue {
  /** Shows a notification at the bottom of the app, over every view. */
  notify(notification: NotificationInput): void;
}

export const NotificationsContext = createContext<
  NotificationsValue | undefined
>(undefined);
