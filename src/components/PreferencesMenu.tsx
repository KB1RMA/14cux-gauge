// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { CheckIcon, GearIcon } from '@radix-ui/react-icons';
import { DropdownMenu } from 'radix-ui';
import { useId, type KeyboardEvent } from 'react';
import { useCanKeepScreenOn } from '../screen/useScreenWake';
import type {
  GaugeStylePreference,
  PalettePreference,
  ThemePreference,
  UsageCountsPreference,
} from '../settings/preferences';
import { usePreferences } from '../preferences/usePreferences';
import type { SpeedUnit, TemperatureUnit } from '../units';
import styles from './PreferencesMenu.module.css';

interface Option<T extends string> {
  value: T;
  text: string;
  /** Short visual reminder, such as a unit symbol; not read out. */
  hint?: string;
  /** Shows a paint chip, styled per value in the CSS module; not read out. */
  swatch?: boolean;
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange(value: T): void;
}

/** Picks an option by its value, for `RadioGroup`'s untyped callback. */
function choose<T extends string>(
  options: readonly Option<T>[],
  next: string,
  onChange: (value: T) => void,
): void {
  const option = options.find((o) => o.value === next);

  if (option) {
    onChange(option.value);
  }
}

/** Keeps the menu open, so several preferences can be changed in one visit. */
const stayOpen = (event: Event) => {
  event.preventDefault();
};

/**
 * Moves focus to the segment beside the focused one on Left or Right, as the
 * row's layout suggests. The menu itself moves only on Up and Down, and
 * Radix marks whichever item has focus as highlighted.
 */
function moveAlongRow(event: KeyboardEvent<HTMLDivElement>): void {
  const step =
    event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;

  if (step === 0) {
    return;
  }

  event.preventDefault();

  const segments = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      '[role="menuitemradio"]',
    ),
  ];
  const current = segments.findIndex((segment) => segment === event.target);

  segments[current + step]?.focus();
}

/**
 * A few short choices side by side on one row, beside their label, like a
 * segmented toggle. Still `menuitemradio`s, so Up and Down move through the
 * menu and Enter or Space picks, as in `ChoiceGroup`; Left and Right also
 * move along the row. Each shows its `hint` if it has one, named with the
 * full text and the hint, so the name includes what is shown.
 */
function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChoiceGroupProps<T>) {
  const labelId = useId();

  return (
    <div className={styles['row']}>
      <DropdownMenu.Label id={labelId} className={styles['rowLabel']}>
        {label}
      </DropdownMenu.Label>
      <DropdownMenu.RadioGroup
        aria-labelledby={labelId}
        value={value}
        onValueChange={(next) => {
          choose(options, next, onChange);
        }}
        className={styles['segments']}
        onKeyDown={moveAlongRow}
      >
        {options.map((option) => (
          <DropdownMenu.RadioItem
            key={option.value}
            value={option.value}
            className={styles['segment']}
            aria-label={
              option.hint ? `${option.text} (${option.hint})` : undefined
            }
            onSelect={stayOpen}
          >
            <span className={styles['tick']}>
              <DropdownMenu.ItemIndicator>
                <CheckIcon aria-hidden="true" />
              </DropdownMenu.ItemIndicator>
            </span>
            {option.hint ?? option.text}
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </div>
  );
}

/** A labelled set of `menuitemradio`s: arrow keys move, Enter or Space picks. */
function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChoiceGroupProps<T>) {
  const labelId = useId();

  return (
    <>
      <DropdownMenu.Label id={labelId} className={styles['label']}>
        {label}
      </DropdownMenu.Label>
      <DropdownMenu.RadioGroup
        aria-labelledby={labelId}
        value={value}
        onValueChange={(next) => {
          choose(options, next, onChange);
        }}
      >
        {options.map((option) => (
          <DropdownMenu.RadioItem
            key={option.value}
            value={option.value}
            className={styles['item']}
            onSelect={stayOpen}
          >
            <DropdownMenu.ItemIndicator className={styles['indicator']}>
              <CheckIcon aria-hidden="true" />
            </DropdownMenu.ItemIndicator>
            {option.swatch ? (
              <span
                className={styles['swatch']}
                data-paint={option.value}
                aria-hidden="true"
              />
            ) : null}
            {option.text}
            {option.hint ? (
              <span className={styles['hint']} aria-hidden="true">
                {option.hint}
              </span>
            ) : null}
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </>
  );
}

const TEMPERATURE_OPTIONS = [
  { value: 'F', text: 'Fahrenheit', hint: '°F' },
  { value: 'C', text: 'Celsius', hint: '°C' },
] as const satisfies readonly Option<TemperatureUnit>[];

const SPEED_OPTIONS = [
  { value: 'mph', text: 'Miles per hour', hint: 'mph' },
  { value: 'kmh', text: 'Kilometres per hour', hint: 'km/h' },
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

/**
 * The app bar's settings menu: display units, gauge style, theme and paint,
 * kept off the dashboard. `offerUsageCounts` adds the usage-counts choice,
 * which only matters where the app counts usage (the published site).
 */
export function PreferencesMenu({
  offerUsageCounts = false,
}: {
  offerUsageCounts?: boolean;
}) {
  const {
    temperatureUnit,
    setTemperatureUnit,
    speedUnit,
    setSpeedUnit,
    gaugeStyle,
    setGaugeStyle,
    theme,
    setTheme,
    palette,
    setPalette,
    usageCounts,
    setUsageCounts,
    keepScreenOn,
    setKeepScreenOn,
  } = usePreferences();
  const canKeepScreenOn = useCanKeepScreenOn();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={styles['trigger']}
        aria-label="Preferences"
      >
        <GearIcon aria-hidden="true" width={18} height={18} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles['content']}
          align="end"
          sideOffset={6}
          collisionPadding={16}
        >
          <ChoiceRow
            label="Temperature"
            options={TEMPERATURE_OPTIONS}
            value={temperatureUnit}
            onChange={setTemperatureUnit}
          />
          <DropdownMenu.Separator className={styles['separator']} />
          <ChoiceRow
            label="Speed"
            options={SPEED_OPTIONS}
            value={speedUnit}
            onChange={setSpeedUnit}
          />
          <DropdownMenu.Separator className={styles['separator']} />
          <ChoiceRow
            label="Gauge style"
            options={GAUGE_STYLE_OPTIONS}
            value={gaugeStyle}
            onChange={setGaugeStyle}
          />
          <DropdownMenu.Separator className={styles['separator']} />
          <ChoiceRow
            label="Theme"
            options={THEME_OPTIONS}
            value={theme}
            onChange={setTheme}
          />
          <DropdownMenu.Separator className={styles['separator']} />
          <ChoiceGroup
            label="Paint"
            options={PALETTE_OPTIONS}
            value={palette}
            onChange={setPalette}
          />
          <DropdownMenu.Separator className={styles['separator']} />
          <DropdownMenu.Label className={styles['label']}>
            Screen
          </DropdownMenu.Label>
          <DropdownMenu.CheckboxItem
            className={styles['item']}
            checked={keepScreenOn}
            disabled={!canKeepScreenOn}
            onCheckedChange={setKeepScreenOn}
            onSelect={stayOpen}
          >
            <DropdownMenu.ItemIndicator className={styles['indicator']}>
              <CheckIcon aria-hidden="true" />
            </DropdownMenu.ItemIndicator>
            Keep the screen on while connected
            {canKeepScreenOn ? null : (
              <span className={styles['hint']}>Not supported</span>
            )}
          </DropdownMenu.CheckboxItem>
          {offerUsageCounts && (
            <>
              <DropdownMenu.Separator className={styles['separator']} />
              <ChoiceGroup
                label="Usage counts"
                options={USAGE_COUNT_OPTIONS}
                value={usageCounts}
                onChange={setUsageCounts}
              />
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
