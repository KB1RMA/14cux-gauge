// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { CheckIcon, GearIcon } from '@radix-ui/react-icons';
import { DropdownMenu } from 'radix-ui';
import { useId } from 'react';
import type {
  PalettePreference,
  ThemePreference,
} from '../preferences/context';
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
          const option = options.find((o) => o.value === next);

          if (option) {
            onChange(option.value);
          }
        }}
      >
        {options.map((option) => (
          <DropdownMenu.RadioItem
            key={option.value}
            value={option.value}
            className={styles['item']}
            // Stay open, so several preferences can be changed in one visit.
            onSelect={(event) => {
              event.preventDefault();
            }}
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

/** The app bar's settings menu: display units, theme and paint, kept off the dashboard. */
export function PreferencesMenu() {
  const {
    temperatureUnit,
    setTemperatureUnit,
    speedUnit,
    setSpeedUnit,
    theme,
    setTheme,
    palette,
    setPalette,
  } = usePreferences();

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
          <ChoiceGroup
            label="Temperature"
            options={TEMPERATURE_OPTIONS}
            value={temperatureUnit}
            onChange={setTemperatureUnit}
          />
          <DropdownMenu.Separator className={styles['separator']} />
          <ChoiceGroup
            label="Speed"
            options={SPEED_OPTIONS}
            value={speedUnit}
            onChange={setSpeedUnit}
          />
          <DropdownMenu.Separator className={styles['separator']} />
          <ChoiceGroup
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
