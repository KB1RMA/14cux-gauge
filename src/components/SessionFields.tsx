// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { useId } from 'react';
import styles from './SessionFields.module.css';

export interface SessionFieldsProps {
  name: string;
  notes: string;
  onNameChange(name: string): void;
  onNotesChange(notes: string): void;
}

/** The editable parts of a recorded session: its name and notes. */
export function SessionFields({
  name,
  notes,
  onNameChange,
  onNotesChange,
}: SessionFieldsProps) {
  const nameId = useId();
  const notesId = useId();
  const notesHintId = useId();

  return (
    <div className={styles['fields']}>
      <div className={styles['field']}>
        <label htmlFor={nameId}>Name</label>
        <input
          id={nameId}
          type="text"
          required
          autoComplete="off"
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value);
          }}
        />
      </div>
      <div className={styles['field']}>
        <label htmlFor={notesId}>Notes</label>
        <span id={notesHintId} className={styles['hint']}>
          Optional. What you were testing, symptoms, changes made.
        </span>
        <textarea
          id={notesId}
          rows={4}
          aria-describedby={notesHintId}
          value={notes}
          onChange={(event) => {
            onNotesChange(event.target.value);
          }}
        />
      </div>
    </div>
  );
}
