// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  CaretDownIcon,
  CaretSortIcon,
  CaretUpIcon,
  CheckIcon,
  DividerHorizontalIcon,
} from '@radix-ui/react-icons';
import {
  functionalUpdate,
  useTable,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Checkbox, VisuallyHidden } from 'radix-ui';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { SessionSummary } from '../model/session';
import { sessionPath } from '../routing/paths';
import {
  formatDateTime,
  formatDuration,
  sourceLabel,
} from '../sessions/format';
import {
  DEFAULT_SESSION_SORT,
  sessionColumns,
  sessionTableFeatures,
  type SessionRow,
} from '../sessions/sessionTable';
import styles from './Sessions.module.css';

function lengthText({ session, recording }: SessionRow): string {
  if (recording) {
    return 'Recording…';
  }

  // The page closed before recording stopped.
  return session.endedAt === null
    ? 'Unfinished'
    : formatDuration(session.endedAt - session.startedAt);
}

/** What each column's cell shows, apart from the name's. */
const CELLS: Record<string, (row: SessionRow) => string> = {
  recorded: ({ session }) => formatDateTime(session.startedAt),
  length: lengthText,
  samples: ({ session }) => session.sampleCount.toLocaleString(),
  source: ({ session }) => sourceLabel(session.source),
};

function SelectBox({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean | 'indeterminate';
  onCheckedChange(checked: boolean): void;
}) {
  return (
    <Checkbox.Root
      className={styles['checkbox']}
      aria-label={label}
      checked={checked}
      onCheckedChange={(state) => {
        onCheckedChange(state === true);
      }}
    >
      <Checkbox.Indicator>
        {checked === 'indeterminate' ? (
          <DividerHorizontalIcon aria-hidden="true" />
        ) : (
          <CheckIcon aria-hidden="true" />
        )}
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

/**
 * Every readable session as a table the user can sort by any column and
 * choose sessions from, to save them together. `selection` holds the chosen
 * sessions' ids.
 */
export function SessionTable({
  sessions,
  recordingId,
  selection,
  onSelectionChange,
  onDelete,
  linkRef,
}: {
  sessions: readonly SessionSummary[];
  /** The session being recorded now, if any. */
  recordingId: string | undefined;
  selection: RowSelectionState;
  onSelectionChange(selection: RowSelectionState): void;
  onDelete(session: SessionSummary): void;
  /** Called with each session's link, so the list can move focus to it. */
  linkRef(id: string, link: HTMLAnchorElement | null): void;
}) {
  const data = useMemo(
    () =>
      sessions.map((session) => ({
        session,
        recording: session.id === recordingId,
      })),
    [sessions, recordingId],
  );
  const [sorting, setSorting] = useState(DEFAULT_SESSION_SORT);
  const table = useTable({
    features: sessionTableFeatures,
    columns: sessionColumns,
    data,
    getRowId: (row) => row.session.id,
    // A column sorts one way then the other; there is always an order.
    enableSortingRemoval: false,
    enableMultiSort: false,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: (updater) => {
      onSelectionChange(functionalUpdate(updater, selection));
    },
  });
  const allSelected = table.getIsAllRowsSelected();

  return (
    <div className={styles['tableScroll']}>
      <table aria-labelledby="sessions-title" className={styles['table']}>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              <th scope="col" className={styles['select']}>
                <SelectBox
                  label="Select all sessions"
                  checked={
                    allSelected ||
                    (table.getIsSomeRowsSelected() && 'indeterminate')
                  }
                  onCheckedChange={(checked) => {
                    table.toggleAllRowsSelected(checked);
                  }}
                />
              </th>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                let SortIcon = CaretSortIcon;

                if (sorted === 'asc') {
                  SortIcon = CaretUpIcon;
                } else if (sorted === 'desc') {
                  SortIcon = CaretDownIcon;
                }

                return (
                  <th
                    key={header.id}
                    scope="col"
                    data-column={header.column.id}
                    aria-sort={
                      sorted === false
                        ? undefined
                        : sorted === 'asc'
                          ? 'ascending'
                          : 'descending'
                    }
                  >
                    <button
                      type="button"
                      className={styles['sort']}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                      <SortIcon aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
              <th scope="col">
                <VisuallyHidden.Root>Actions</VisuallyHidden.Root>
              </th>
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const { session, recording } = row.original;

            return (
              <tr key={row.id}>
                <td className={styles['select']}>
                  <SelectBox
                    label={`Select ${session.name}`}
                    checked={row.getIsSelected()}
                    onCheckedChange={(checked) => {
                      row.toggleSelected(checked);
                    }}
                  />
                </td>
                {row.getAllCells().map((cell) =>
                  cell.column.id === 'name' ? (
                    <th key={cell.id} scope="row" className={styles['name']}>
                      <Link
                        ref={(link) => {
                          linkRef(session.id, link);
                        }}
                        to={sessionPath(session.id)}
                        className={styles['open']}
                      >
                        {session.name}
                      </Link>
                      {/* A space, so the name and notes read as two words. */}{' '}
                      {session.notes ? (
                        <span className={styles['notes']}>{session.notes}</span>
                      ) : null}
                    </th>
                  ) : (
                    <td
                      key={cell.id}
                      data-column={cell.column.id}
                      className={styles['cell']}
                    >
                      {CELLS[cell.column.id]?.(row.original)}
                    </td>
                  ),
                )}
                <td>
                  <button
                    type="button"
                    className={`danger ${styles['delete'] ?? ''}`}
                    disabled={recording}
                    onClick={() => {
                      onDelete(session);
                    }}
                  >
                    Delete{' '}
                    <VisuallyHidden.Root>{session.name}</VisuallyHidden.Root>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
