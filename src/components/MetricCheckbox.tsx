// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { CheckIcon } from '@radix-ui/react-icons';
import { Checkbox } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import styles from './GraphsView.module.css';

/** A labelled checkbox for one metric in a picker, with optional extras. */
export function MetricCheckbox({
  label,
  checked,
  disabled = false,
  onCheckedChange,
  children,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange(checked: boolean): void;
  /** Shown after the label, such as a note or a button. */
  children?: ReactNode;
}) {
  const id = useId();

  return (
    <div className={styles['option']}>
      <Checkbox.Root
        id={id}
        className={styles['checkbox']}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(state) => {
          onCheckedChange(state === true);
        }}
      >
        <Checkbox.Indicator>
          <CheckIcon aria-hidden="true" />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
