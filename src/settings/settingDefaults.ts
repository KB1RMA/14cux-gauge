// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import type { UsageCountsPreference } from './preferences';

/**
 * Settings whose default depends on where the app runs. Defined here, below
 * the platform, which provides them (see `SettingsBackend.defaults`).
 */
export interface SettingDefaults {
  usageCounts: UsageCountsPreference;
}
