// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { CheckIcon, Cross2Icon, GearIcon } from '@radix-ui/react-icons';
import { Checkbox, Dialog, RadioGroup, Tabs } from 'radix-ui';
import { useId, useRef, useState, type ReactNode } from 'react';
import { usePreferences } from '../preferences/usePreferences';
import {
  PREFERENCES_SECTIONS,
  type PreferencesSection,
} from '../routing/paths';
import { usePreferencesRoute } from '../routing/usePreferencesRoute';
import { useCanKeepScreenOn } from '../screen/useScreenWake';
import type {
  GaugeStylePreference,
  PalettePreference,
  ThemePreference,
  UsageCountsPreference,
} from '../settings/preferences';
import type { SpeedUnit, TemperatureUnit } from '../units';
import { LimitsPreferences } from './LimitsPreferences';
import { createPendingEdits } from './pendingEdits';
import styles from './Preferences.module.css';

interface Option<T extends string> {
  value: T;
  text: string;
  /** Shows a paint chip, styled per value in the CSS module; not read out. */
  swatch?: boolean;
}

/** A labelled setting: its name, and the control or controls that set it. */
function Setting({
  label,
  labelId,
  children,
}: {
  label: string;
  labelId: string;
  children: ReactNode;
}) {
  return (
    <div className={styles['setting']}>
      <h3 id={labelId} className={styles['settingLabel']}>
        {label}
      </h3>
      {children}
    </div>
  );
}

/**
 * One choice from a few, side by side as a segmented control, or stacked
 * when there are many or they are long. Arrow keys move between them and
 * choose, as in any radio group.
 */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  stacked = false,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange(value: T): void;
  stacked?: boolean;
}) {
  const labelId = useId();

  return (
    <Setting label={label} labelId={labelId}>
      <RadioGroup.Root
        aria-labelledby={labelId}
        value={value}
        onValueChange={(next) => {
          const option = options.find((o) => o.value === next);

          if (option) {
            onChange(option.value);
          }
        }}
        className={styles[stacked ? 'stack' : 'segments']}
      >
        {options.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={styles[stacked ? 'option' : 'segment']}
          >
            <span className={styles['tick']}>
              <RadioGroup.Indicator>
                <CheckIcon aria-hidden="true" />
              </RadioGroup.Indicator>
            </span>
            {option.swatch ? (
              <span
                className={styles['swatch']}
                data-paint={option.value}
                aria-hidden="true"
              />
            ) : null}
            {option.text}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </Setting>
  );
}

const TEMPERATURE_OPTIONS = [
  { value: 'F', text: 'Fahrenheit (°F)' },
  { value: 'C', text: 'Celsius (°C)' },
] as const satisfies readonly Option<TemperatureUnit>[];

const SPEED_OPTIONS = [
  { value: 'mph', text: 'Miles per hour (mph)' },
  { value: 'kmh', text: 'Kilometres per hour (km/h)' },
] as const satisfies readonly Option<SpeedUnit>[];

const GAUGE_STYLE_OPTIONS = [
  { value: 'tiles', text: 'Tiles' },
  { value: 'dials', text: 'Dials' },
] as const satisfies readonly Option<GaugeStylePreference>[];

const THEME_OPTIONS = [
  { value: 'system', text: 'System' },
  { value: 'light', text: 'Light' },
  { value: 'dark', text: 'Dark' },
] as const satisfies readonly Option<ThemePreference>[];

const PALETTE_OPTIONS = [
  { value: 'coniston', text: 'Coniston Green', swatch: true },
  { value: 'arles', text: 'Arles Blue', swatch: true },
  {
    value: 'alpine-beluga',
    text: 'Alpine White and Beluga Black',
    swatch: true,
  },
  { value: 'racing-green', text: 'British Racing Green', swatch: true },
] as const satisfies readonly Option<PalettePreference>[];

const USAGE_COUNT_OPTIONS = [
  { value: 'on', text: 'Count my visits anonymously' },
  { value: 'off', text: 'Don’t count my visits' },
] as const satisfies readonly Option<UsageCountsPreference>[];

const SECTION_TITLES: Record<PreferencesSection, string> = {
  general: 'General',
  appearance: 'Appearance',
  limits: 'Limits',
};

function KeepScreenOn() {
  const { keepScreenOn, setKeepScreenOn } = usePreferences();
  const canKeepScreenOn = useCanKeepScreenOn();
  const labelId = useId();
  const id = useId();
  const hintId = useId();

  return (
    <Setting label="Screen" labelId={labelId}>
      <div className={styles['check']}>
        <Checkbox.Root
          id={id}
          className={styles['box']}
          checked={keepScreenOn}
          disabled={!canKeepScreenOn}
          aria-describedby={canKeepScreenOn ? undefined : hintId}
          onCheckedChange={(checked) => {
            setKeepScreenOn(checked === true);
          }}
        >
          <Checkbox.Indicator>
            <CheckIcon aria-hidden="true" />
          </Checkbox.Indicator>
        </Checkbox.Root>
        <label htmlFor={id}>Keep the screen on while connected</label>
      </div>
      {canKeepScreenOn ? null : (
        <p id={hintId} className={styles['hint']}>
          Not supported in this browser.
        </p>
      )}
    </Setting>
  );
}

function GeneralPreferences({
  offerUsageCounts,
}: {
  offerUsageCounts: boolean;
}) {
  const {
    temperatureUnit,
    setTemperatureUnit,
    speedUnit,
    setSpeedUnit,
    gaugeStyle,
    setGaugeStyle,
    usageCounts,
    setUsageCounts,
  } = usePreferences();

  return (
    <>
      <Choice
        label="Temperature"
        options={TEMPERATURE_OPTIONS}
        value={temperatureUnit}
        onChange={setTemperatureUnit}
      />
      <Choice
        label="Speed"
        options={SPEED_OPTIONS}
        value={speedUnit}
        onChange={setSpeedUnit}
      />
      <Choice
        label="Gauge style"
        options={GAUGE_STYLE_OPTIONS}
        value={gaugeStyle}
        onChange={setGaugeStyle}
      />
      <KeepScreenOn />
      {offerUsageCounts ? (
        <Choice
          label="Usage counts"
          options={USAGE_COUNT_OPTIONS}
          value={usageCounts}
          onChange={setUsageCounts}
          stacked
        />
      ) : null}
    </>
  );
}

function AppearancePreferences() {
  const { theme, setTheme, palette, setPalette } = usePreferences();

  return (
    <>
      <Choice
        label="Theme"
        options={THEME_OPTIONS}
        value={theme}
        onChange={setTheme}
      />
      <Choice
        label="Paint"
        options={PALETTE_OPTIONS}
        value={palette}
        onChange={setPalette}
        stacked
      />
    </>
  );
}

/**
 * The gear in the app bar, and the Preferences dialog it opens over the
 * current view: units, gauge style, the screen and usage counts, then
 * theme and paint, then reading limits, each section a tab. Everything
 * applies as it is chosen. Which section is open is part of the address
 * (`?preferences=limits`), so Back closes the dialog and a link can open it.
 * `offerUsageCounts` adds the usage-counts choice, which only matters where
 * the app counts usage (the published site).
 */
export function Preferences({
  offerUsageCounts = false,
}: {
  offerUsageCounts?: boolean;
}) {
  const { section, open, select, close } = usePreferencesRoute();
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Limits typed but not yet applied, applied before closing or changing
  // section, or holding Preferences open to show why they cannot be.
  const [pending] = useState(createPendingEdits);

  const holdOpen = (event: { preventDefault(): void }) => {
    if (!pending.applyAll()) {
      event.preventDefault();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles['trigger']}
        aria-label="Preferences"
        aria-haspopup="dialog"
        aria-expanded={section !== undefined}
        onClick={() => {
          open();
        }}
      >
        <GearIcon aria-hidden="true" width={18} height={18} />
      </button>
      <Dialog.Root
        open={section !== undefined}
        onOpenChange={(next) => {
          if (!next) {
            close();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles['overlay']} />
          <Dialog.Content
            className={styles['dialog']}
            aria-describedby={undefined}
            onEscapeKeyDown={holdOpen}
            onInteractOutside={holdOpen}
            onCloseAutoFocus={(event) => {
              // Back to the gear, also when the dialog was opened by a link.
              event.preventDefault();
              triggerRef.current?.focus();
            }}
          >
            <div className={styles['header']}>
              <Dialog.Title className={styles['title']}>
                Preferences
              </Dialog.Title>
              <Dialog.Close
                className={styles['close']}
                aria-label="Close preferences"
                onClick={holdOpen}
              >
                <Cross2Icon aria-hidden="true" width={18} height={18} />
              </Dialog.Close>
            </div>
            <Tabs.Root
              className={styles['tabs']}
              value={section ?? 'general'}
              onValueChange={(next) => {
                const known = PREFERENCES_SECTIONS.find((s) => s === next);

                if (known && pending.applyAll()) {
                  select(known);
                }
              }}
            >
              <Tabs.List
                className={styles['tabList']}
                aria-label="Preference sections"
              >
                {PREFERENCES_SECTIONS.map((id) => (
                  <Tabs.Trigger
                    key={id}
                    value={id}
                    className={styles['tab']}
                    // A tab chooses on mouse down and again on the focus
                    // that follows; holding it here keeps both from
                    // leaving an invalid limit unseen.
                    onMouseDown={holdOpen}
                  >
                    {SECTION_TITLES[id]}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <Tabs.Content value="general" className={styles['panel']}>
                <GeneralPreferences offerUsageCounts={offerUsageCounts} />
              </Tabs.Content>
              <Tabs.Content value="appearance" className={styles['panel']}>
                <AppearancePreferences />
              </Tabs.Content>
              <Tabs.Content value="limits" className={styles['panel']}>
                <LimitsPreferences pending={pending} />
              </Tabs.Content>
            </Tabs.Root>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
