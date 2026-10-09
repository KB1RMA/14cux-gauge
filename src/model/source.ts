// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import * as z from 'zod/mini';

/**
 * What a recording or ROM image was read from, as it is stored. Kept apart
 * from the app's connection types, so a new way of connecting does not change
 * what is stored without a deliberate format change.
 */
export const recordedSourceSchema = z.enum(['serial', 'demo']);

export type RecordedSource = z.infer<typeof recordedSourceSchema>;
