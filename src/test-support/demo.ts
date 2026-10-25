// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Connects to the demo ECU from the connect screen. */
export async function connectDemo(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'Demo mode' }));
  await screen.findByRole('heading', { name: 'Live data' });
}
