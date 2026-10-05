// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildInfo } from '../src/buildInfo.ts';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function currentCommit(root: string, env: NodeJS.ProcessEnv): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return env['GITHUB_SHA'] ?? null;
  }
}

/**
 * What a build is made from: the package.json version, the git commit and,
 * for a release build, its tag. release.yml sets RELEASE_TAG to the tag being
 * released; any other build is a development build.
 *
 * The single source for anything that stamps or publishes the version, so the
 * footer and any later update check agree on it.
 */
export function readBuildInfo({
  root = PROJECT_ROOT,
  env = process.env,
}: { root?: string; env?: NodeJS.ProcessEnv } = {}): BuildInfo {
  const { version } = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  ) as { version: string };
  const releaseTag = env['RELEASE_TAG'] || null;

  if (releaseTag !== null && releaseTag !== `v${version}`) {
    throw new Error(
      `RELEASE_TAG ${releaseTag} does not match package.json version ${version}`,
    );
  }

  return { version, commit: currentCommit(root, env), releaseTag };
}
