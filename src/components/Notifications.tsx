// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  CheckCircledIcon,
  Cross2Icon,
  CrossCircledIcon,
  UpdateIcon,
} from '@radix-ui/react-icons';
import { Toast } from 'radix-ui';
import type { ReactNode } from 'react';
import type { Notification, NotificationTone } from '../notifications/context';
import styles from './Notifications.module.css';

/** How long a success stays up, unless hovered or focused. */
const SUCCESS_MS = 8000;

const ICONS: Record<NotificationTone, ReactNode> = {
  progress: <UpdateIcon aria-hidden="true" className={styles['spin']} />,
  success: <CheckCircledIcon aria-hidden="true" />,
  error: <CrossCircledIcon aria-hidden="true" />,
};

/**
 * Slides notifications up from the bottom of the window. F8 moves focus to
 * them. Something still under way, and every error, stays until it is
 * replaced or dismissed; only a success closes itself.
 */
export function Notifications({
  list,
  onDismiss,
  children,
}: {
  list: readonly Notification[];
  onDismiss(id: number): void;
  children: ReactNode;
}) {
  return (
    <Toast.Provider swipeDirection="down" duration={SUCCESS_MS}>
      {children}
      {list.map(({ id, tone, title, message, open }) => (
        <Toast.Root
          key={id}
          open={open}
          onOpenChange={(next) => {
            if (!next) {
              onDismiss(id);
            }
          }}
          // Hidden from assistive tech while it animates away.
          aria-hidden={!open}
          className={styles['toast']}
          data-tone={tone}
          // Errors interrupt; progress and success wait their turn.
          type={tone === 'error' ? 'foreground' : 'background'}
          {...(tone === 'success' ? {} : { duration: Infinity })}
        >
          <span className={styles['icon']}>{ICONS[tone]}</span>
          <Toast.Title className={styles['title']}>{title}</Toast.Title>
          <Toast.Description className={styles['message']}>
            {message}
          </Toast.Description>
          <Toast.Close className={styles['close']} aria-label="Dismiss">
            <Cross2Icon aria-hidden="true" />
          </Toast.Close>
        </Toast.Root>
      ))}
      <Toast.Viewport className={styles['viewport']} />
    </Toast.Provider>
  );
}
