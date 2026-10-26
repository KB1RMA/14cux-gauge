// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  levelsOutOfOrder,
  limitReached,
  limitsSchema,
  sameLimits,
} from './limits';

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

describe('levelsOutOfOrder', () => {
  it('accepts levels in order, and levels on one side that meet', () => {
    expect(
      levelsOutOfOrder({
        lowAlert: 11,
        lowWarn: 12,
        highWarn: 14.8,
        highAlert: 15.5,
      }),
    ).toEqual([]);
    expect(levelsOutOfOrder({ lowAlert: 12, lowWarn: 12 })).toEqual([]);
    expect(levelsOutOfOrder({ highWarn: 221, highAlert: 221 })).toEqual([]);
    expect(levelsOutOfOrder({})).toEqual([]);
  });

  it('names both levels of each pair out of order, in level order', () => {
    expect(levelsOutOfOrder({ lowAlert: 12.5, lowWarn: 12 })).toEqual([
      'lowAlert',
      'lowWarn',
    ]);
    expect(levelsOutOfOrder({ highWarn: 239, highAlert: 221 })).toEqual([
      'highWarn',
      'highAlert',
    ]);
    // Skips levels that are not set.
    expect(levelsOutOfOrder({ lowAlert: 15, highAlert: 14 })).toEqual([
      'lowAlert',
      'highAlert',
    ]);
  });

  it('refuses a high level at a low one, so no value is both', () => {
    expect(levelsOutOfOrder({ lowWarn: 12, highWarn: 12 })).toEqual([
      'lowWarn',
      'highWarn',
    ]);
  });
});

describe('limitsSchema', () => {
  it('reads finite levels in order', () => {
    expect(limitsSchema.parse({ highWarn: 221, highAlert: 239 })).toEqual({
      highWarn: 221,
      highAlert: 239,
    });
  });

  it('puts an issue on each level of a pair out of order', () => {
    const result = limitsSchema.safeParse({ highWarn: 239, highAlert: 221 });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.map(({ path, message }) => ({ path, message })),
    ).toEqual([
      {
        path: ['highWarn'],
        message:
          'Each level must be above the one before it: very low, low, high, very high.',
      },
      {
        path: ['highAlert'],
        message:
          'Each level must be above the one before it: very low, low, high, very high.',
      },
    ]);
  });

  it('refuses levels that are not finite numbers', () => {
    expect(limitsSchema.safeParse({ highWarn: Infinity }).success).toBe(false);
    expect(limitsSchema.safeParse({ highWarn: Number.NaN }).success).toBe(
      false,
    );
    expect(limitsSchema.safeParse({ highWarn: '221' }).success).toBe(false);
  });
});
