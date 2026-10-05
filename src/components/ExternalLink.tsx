// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { VisuallyHidden } from 'radix-ui';
import type { ReactNode } from 'react';

/**
 * A link that opens in a new tab, so following it does not end a live ECU
 * session. Tells screen-reader users that it opens a new tab.
 */
export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <VisuallyHidden.Root> (opens in a new tab)</VisuallyHidden.Root>
    </a>
  );
}
