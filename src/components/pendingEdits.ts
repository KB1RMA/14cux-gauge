// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * Applies what one part of a section holds as typed. Returns `false` to
 * keep Preferences open because what was typed is invalid and the user has
 * not yet been shown why; `focus` asks it to move focus to the problem.
 */
export type ApplyEdits = (focus: boolean) => boolean;

/**
 * The edits typed in Preferences that have not applied yet, so closing it
 * or changing section can apply them first, or stay open to show what is
 * wrong rather than drop them unseen.
 */
export interface PendingEdits {
  /** Adds `apply`; the returned function removes it. */
  add(apply: ApplyEdits): () => void;
  /**
   * Applies every edit that is valid. `false` if any part asked to stay
   * open; only the first such part moves focus.
   */
  applyAll(): boolean;
}

export function createPendingEdits(): PendingEdits {
  const parts = new Set<ApplyEdits>();

  return {
    add: (apply) => {
      parts.add(apply);

      return () => {
        parts.delete(apply);
      };
    },
    applyAll: () => {
      let open = false;

      for (const apply of parts) {
        if (!apply(!open)) {
          open = true;
        }
      }

      return !open;
    },
  };
}
