// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * What the running bundle was built from; read by `build/buildInfo.ts` and
 * stamped in by `vite.config.ts`.
 */
export interface BuildInfo {
  /** `version` from package.json. */
  version: string;
  /** Full SHA of the commit that was built, or null outside a git checkout. */
  commit: string | null;
  /** The release tag (`v<version>`) for a release build, otherwise null. */
  releaseTag: string | null;
}

declare const __BUILD_INFO__: BuildInfo;

export const BUILD_INFO: BuildInfo = __BUILD_INFO__;
