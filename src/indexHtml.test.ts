// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import indexHtml from '../index.html?raw';

// Page-level accessibility requirements that live in index.html rather than
// in rendered components.
describe('index.html', () => {
  const page = new DOMParser().parseFromString(indexHtml, 'text/html');

  it('declares the page language', () => {
    expect(page.documentElement.lang).toBe('en');
  });

  it('has a descriptive title', () => {
    expect(page.title).toBe('14CUX Gauge');
  });

  it('lets the page zoom', () => {
    const viewport = page
      .querySelector('meta[name="viewport"]')
      ?.getAttribute('content');

    expect(viewport).toBe('width=device-width, initial-scale=1.0');
  });
});
