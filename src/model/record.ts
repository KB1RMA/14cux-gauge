// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type * as z from 'zod/mini';

/**
 * A stored record that is not in any shape this version of the app knows:
 * damaged, edited by hand, or written by a newer version.
 */
export class InvalidRecordError extends Error {
  constructor(
    what: string,
    /** What is wrong with it, without naming the record. */
    readonly detail: string,
  ) {
    super(`The stored ${what} could not be read: ${detail}`);
    this.name = 'InvalidRecordError';
  }
}

/**
 * A stored record that could not be read, listed so the user can see it is
 * there and delete it, rather than have it vanish.
 */
export interface UnreadableRecord {
  id: string;
  /** What is wrong with it. */
  detail: string;
}

/**
 * Sorts stored records, given as `[id, record]` pairs, into those `read`
 * accepts and those it rejects with an {@link InvalidRecordError}. Any other
 * error is thrown.
 */
export function sortRecords<T>(
  entries: readonly (readonly [id: string, raw: unknown])[],
  read: (raw: unknown) => T,
): { readable: T[]; unreadable: UnreadableRecord[] } {
  const readable: T[] = [];
  const unreadable: UnreadableRecord[] = [];

  for (const [id, raw] of entries) {
    try {
      readable.push(read(raw));
    } catch (error) {
      if (!(error instanceof InvalidRecordError)) {
        throw error;
      }

      unreadable.push({ id, detail: error.detail });
    }
  }

  return { readable, unreadable };
}

/** `raw` checked against `schema`, or an {@link InvalidRecordError}. */
export function parseRecord<T>(
  schema: z.ZodMiniType<T>,
  raw: unknown,
  what: string,
): T {
  const result = schema.safeParse(raw);

  if (!result.success) {
    throw new InvalidRecordError(
      what,
      result.error.issues
        .map(({ path, message }) =>
          path.length > 0 ? `${path.join('.')}: ${message}` : message,
        )
        .join('; '),
    );
  }

  return result.data;
}

/** Treats `raw` as a plain object, or an empty one if it is not. */
export function fieldsOf(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}
