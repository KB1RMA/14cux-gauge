// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { BuildInfo } from '../buildInfo';

/** Whether two builds are the same code; the version alone is not enough, as every commit to main shares one. */
export function sameBuild(a: BuildInfo, b: BuildInfo): boolean {
  return a.version === b.version && a.commit === b.commit;
}

/** How a build is named to the user: its release tag, else version and commit. */
export function describeBuild(build: BuildInfo): string {
  if (build.releaseTag !== null) {
    return build.releaseTag;
  }

  return build.commit === null
    ? build.version
    : `${build.version} (${build.commit.slice(0, 7)})`;
}

/** Reads a `version.json` body, or undefined if it is not one. */
export function parseBuildInfo(value: unknown): BuildInfo | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const { version, commit, releaseTag } = value as Record<string, unknown>;

  if (
    typeof version !== 'string' ||
    !(commit === null || typeof commit === 'string') ||
    !(releaseTag === null || typeof releaseTag === 'string')
  ) {
    return undefined;
  }

  return { version, commit, releaseTag };
}
