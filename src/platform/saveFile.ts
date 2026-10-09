// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { describeRawError } from '../diagnostics/diagnosticLog';
import type { FilePlatform } from './platform';

/**
 * What a view tells the user after asking to save a file: nothing once it
 * is saved, or why it was not.
 */
/** `message` is a whole sentence, naming the file and why. */
export type SaveFeedback =
  { kind: 'cancelled' } | { kind: 'failed'; message: string };

/**
 * Saves a file through `files`, and says what the user needs to know if it
 * was not saved. Never rejects.
 */
export async function saveFile(
  files: FilePlatform,
  name: string,
  data: string | Uint8Array,
  type: string,
): Promise<SaveFeedback | undefined> {
  try {
    return (await files.save(name, data, type)) === 'saved'
      ? undefined
      : { kind: 'cancelled' };
  } catch (error) {
    // One sentence, however the error's own message ends.
    const detail = describeRawError(error).replace(/\.$/, '');

    return {
      kind: 'failed',
      message: `${name} could not be saved: ${detail}.`,
    };
  }
}
