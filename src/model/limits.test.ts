// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import { limitReached, sameLimits } from './limits';

describe('limitReached', () => {
  const limits = { lowAlert: 11, lowWarn: 12, highWarn: 14.8, highAlert: 15.5 };

  it('reaches a low level at or below it and a high level at or above it', () => {
    expect(limitReached(limits, 10.99)).toBe('lowAlert');
    expect(limitReached(limits, 11)).toBe('lowAlert');
    expect(limitReached(limits, 11.01)).toBe('lowWarn');
    expect(limitReached(limits, 12)).toBe('lowWarn');
    expect(limitReached(limits, 12.01)).toBeUndefined();
    expect(limitReached(limits, 14.79)).toBeUndefined();
    expect(limitReached(limits, 14.8)).toBe('highWarn');
    expect(limitReached(limits, 15.49)).toBe('highWarn');
    expect(limitReached(limits, 15.5)).toBe('highAlert');
  });

  it('treats zero and negative samples as values, not as missing', () => {
    expect(limitReached({ lowWarn: 0 }, 0)).toBe('lowWarn');
    expect(limitReached({ lowWarn: 0 }, -0.1)).toBe('lowWarn');
    expect(limitReached({ highWarn: -40 }, -40)).toBe('highWarn');
    expect(limitReached({ highWarn: 0 }, -1)).toBeUndefined();
  });

  it('uses only the levels that are set', () => {
    expect(limitReached({}, 1e9)).toBeUndefined();
    expect(limitReached({ highAlert: 239 }, 230)).toBeUndefined();
    expect(limitReached({ highAlert: 239 }, 239)).toBe('highAlert');
    expect(limitReached({ lowAlert: 11 }, 11)).toBe('lowAlert');
  });
});

describe('sameLimits', () => {
  it('compares each level, set or not', () => {
    expect(sameLimits({}, {})).toBe(true);
    expect(sameLimits({ highWarn: 221 }, { highWarn: 221 })).toBe(true);
    expect(sameLimits({ highWarn: 221 }, { highWarn: 220 })).toBe(false);
    expect(sameLimits({ highWarn: 221 }, {})).toBe(false);
    expect(sameLimits({ highWarn: 221 }, { highAlert: 221 })).toBe(false);
  });
});
