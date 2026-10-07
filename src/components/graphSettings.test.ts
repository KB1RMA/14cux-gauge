// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { parseGraphSettings } from './graphSettings';

describe('parseGraphSettings', () => {
  it('defaults to a one-minute window in a grid', () => {
    expect(parseGraphSettings(undefined)).toEqual({
      window: 60,
      layout: 'grid',
      hidden: [],
    });
  });

  it('reads the window, including the session, and the layout', () => {
    expect(
      parseGraphSettings({ window: 'session', layout: 'stacked' }),
    ).toEqual({ window: 'session', layout: 'stacked', hidden: [] });
  });

  it('reads the window an earlier version stored', () => {
    expect(parseGraphSettings({ windowSeconds: 600 }).window).toBe(600);
  });

  it('ignores values it does not recognise', () => {
    expect(
      parseGraphSettings({ window: 45, layout: 'masonry', hidden: ['x'] }),
    ).toEqual({ window: 60, layout: 'grid', hidden: [] });
  });
});
