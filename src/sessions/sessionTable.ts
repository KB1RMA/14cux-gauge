// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  type SortFn,
  type SortingState,
} from '@tanstack/react-table';
import type { SessionSummary } from '../model/session';
import { sourceLabel } from './format';

/**
 * The table of recorded sessions: which columns it has, how each sorts, and
 * which features it uses (sorting, and choosing sessions to save together).
 * Kept apart from the view so the definitions stay the same between renders,
 * as TanStack Table needs.
 */

/** A session as the table shows it. */
export interface SessionRow {
  session: SessionSummary;
  /** Whether it is being recorded now. */
  recording: boolean;
}

export const sessionTableFeatures = tableFeatures({
  rowSortingFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
});

const collator = new Intl.Collator();

/** Sorts a column of text as the user's language orders it. */
const textSort: SortFn<typeof sessionTableFeatures, SessionRow> = (a, b, id) =>
  collator.compare(a.getValue<string>(id), b.getValue<string>(id));

const column = createColumnHelper<typeof sessionTableFeatures, SessionRow>();

/** How long a session ran, or `undefined` while recording or if it never stopped. */
export function sessionLength({ session, recording }: SessionRow) {
  return recording || session.endedAt === null
    ? undefined
    : session.endedAt - session.startedAt;
}

export const sessionColumns = column.columns([
  column.accessor((row) => row.session.name, {
    id: 'name',
    header: 'Name',
    sortFn: textSort,
  }),
  column.accessor((row) => row.session.startedAt, {
    id: 'recorded',
    header: 'Recorded',
    sortDescFirst: true,
  }),
  column.accessor(sessionLength, {
    id: 'length',
    header: 'Length',
    sortDescFirst: true,
    // Unfinished sessions have no length; they go last either way.
    sortUndefined: 'last',
  }),
  column.accessor((row) => row.session.sampleCount, {
    id: 'samples',
    header: 'Samples',
    sortDescFirst: true,
  }),
  column.accessor((row) => sourceLabel(row.session.source), {
    id: 'source',
    header: 'Source',
    sortFn: textSort,
  }),
]);

/** Newest first, as the list has always been. */
export const DEFAULT_SESSION_SORT: SortingState = [
  { id: 'recorded', desc: true },
];
