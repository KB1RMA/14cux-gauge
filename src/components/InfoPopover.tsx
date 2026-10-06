// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { Popover } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import styles from './InfoPopover.module.css';

/**
 * A small "About <label>" button that opens an explanation. A popover rather
 * than a hover tooltip, so it works by touch and keyboard alike.
 */
export function InfoPopover({
  label,
  note,
  children,
}: {
  label: string;
  /** A muted aside after the explanation. */
  note?: string | undefined;
  children: ReactNode;
}) {
  const titleId = useId();

  return (
    <Popover.Root>
      <Popover.Trigger
        className={styles['trigger']}
        aria-label={`About ${label}`}
      >
        <InfoCircledIcon aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles['content']}
          aria-labelledby={titleId}
          sideOffset={6}
          collisionPadding={16}
        >
          <p id={titleId} className={styles['title']}>
            {label}
          </p>
          {children}
          {note ? <p className={styles['note']}>{note}</p> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
