// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { goatCounter } from './goatCounter';

function counterScripts(): HTMLScriptElement[] {
  return [
    ...document.querySelectorAll<HTMLScriptElement>(
      'script[src="https://gc.zgo.at/count.js"]',
    ),
  ];
}

describe('goatCounter', () => {
  afterEach(() => {
    for (const script of counterScripts()) {
      script.remove();
    }

    delete window.goatcounter;
  });

  it('counts nothing anywhere but the published site', () => {
    expect(goatCounter('http://localhost:4173')).toBeUndefined();
    expect(goatCounter('https://someone.github.io')).toBeUndefined();
    expect(goatCounter()).toBeUndefined();
  });

  it('loads the GoatCounter script once, pointed at the project counter', () => {
    const counter = goatCounter('https://kb1rma.github.io');

    counter?.start();
    counter?.start();

    const scripts = counterScripts();

    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.async).toBe(true);
    expect(scripts[0]).toHaveAttribute(
      'data-goatcounter',
      'https://14cux-gauge.goatcounter.com/count',
    );
  });

  it('counts an event by name only', () => {
    const count = vi.fn();
    const counter = goatCounter('https://kb1rma.github.io');

    window.goatcounter = { count };
    counter?.count('connected/serial');

    expect(count).toHaveBeenCalledExactlyOnceWith({
      path: 'connected/serial',
      event: true,
    });
  });

  it('drops an event if the script has not loaded or was blocked', () => {
    const counter = goatCounter('https://kb1rma.github.io');

    expect(() => {
      counter?.count('connected/demo');
    }).not.toThrow();

    window.goatcounter = {};

    expect(() => {
      counter?.count('connected/demo');
    }).not.toThrow();
  });
});
