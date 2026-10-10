// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors
import {
  clampWindow,
  followPlayback,
  panWindow,
  sliderStep,
  revealPosition,
  wholeWindow,
  windowBetween,
  zoomWindow,
} from './timeline';

describe('clampWindow', () => {
  it('leaves a window inside the recording alone', () => {
    expect(clampWindow({ start: 2000, end: 5000 }, 10_000)).toEqual({
      start: 2000,
      end: 5000,
    });
  });

  it('slides a window that runs off either end back in, keeping its width', () => {
    expect(clampWindow({ start: -1000, end: 3000 }, 10_000)).toEqual({
      start: 0,
      end: 4000,
    });
    expect(clampWindow({ start: 8000, end: 12_000 }, 10_000)).toEqual({
      start: 6000,
      end: 10_000,
    });
  });

  it('widens a window narrower than a second around its middle', () => {
    expect(clampWindow({ start: 4900, end: 5100 }, 10_000)).toEqual({
      start: 4500,
      end: 5500,
    });
    expect(clampWindow({ start: 5000, end: 5000 }, 10_000)).toEqual({
      start: 4500,
      end: 5500,
    });
  });

  it('shrinks a window wider than the recording to all of it', () => {
    expect(clampWindow({ start: -5000, end: 50_000 }, 10_000)).toEqual({
      start: 0,
      end: 10_000,
    });
  });

  it('fits a recording shorter than a second', () => {
    expect(clampWindow({ start: 0, end: 200 }, 400)).toEqual({
      start: 0,
      end: 400,
    });
    expect(clampWindow({ start: 0, end: 0 }, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe('wholeWindow', () => {
  it('is the whole recording', () => {
    expect(wholeWindow(7000)).toEqual({ start: 0, end: 7000 });
  });
});

describe('zoomWindow', () => {
  const view = { start: 2000, end: 6000 };

  it('zooms in around the anchor, which stays put on screen', () => {
    // The anchor is a quarter of the way across, before and after.
    expect(zoomWindow(view, 0.5, 3000, 10_000)).toEqual({
      start: 2500,
      end: 4500,
    });
  });

  it('zooms out, and stops at the whole recording', () => {
    expect(zoomWindow(view, 2, 4000, 10_000)).toEqual({
      start: 0,
      end: 8000,
    });
    expect(zoomWindow(view, 100, 4000, 10_000)).toEqual({
      start: 0,
      end: 10_000,
    });
  });

  it('stops zooming in at a second', () => {
    expect(zoomWindow(view, 0.01, 4000, 10_000)).toEqual({
      start: 3500,
      end: 4500,
    });
  });

  it('zooms an empty window about its middle', () => {
    expect(zoomWindow({ start: 0, end: 0 }, 2, 0, 0)).toEqual({
      start: 0,
      end: 0,
    });
  });
});

describe('panWindow', () => {
  it('moves the window, keeping its width, and stops at the ends', () => {
    expect(panWindow({ start: 2000, end: 4000 }, 1500, 10_000)).toEqual({
      start: 3500,
      end: 5500,
    });
    expect(panWindow({ start: 2000, end: 4000 }, -5000, 10_000)).toEqual({
      start: 0,
      end: 2000,
    });
    expect(panWindow({ start: 2000, end: 4000 }, 9000, 10_000)).toEqual({
      start: 8000,
      end: 10_000,
    });
  });
});

describe('windowBetween', () => {
  it('spans two times in either order', () => {
    expect(windowBetween(6000, 3000, 10_000)).toEqual({
      start: 3000,
      end: 6000,
    });
  });

  it('is at least a second wide', () => {
    expect(windowBetween(3000, 3200, 10_000)).toEqual({
      start: 2600,
      end: 3600,
    });
  });
});

describe('revealPosition', () => {
  const view = { start: 2000, end: 4000 };

  it('leaves the window alone when the position is in it', () => {
    expect(revealPosition(view, 3000, 10_000)).toBe(view);
    expect(revealPosition(view, 4000, 10_000)).toBe(view);
  });

  it('pages to a position outside it', () => {
    expect(revealPosition(view, 7000, 10_000)).toEqual({
      start: 7000,
      end: 9000,
    });
    expect(revealPosition(view, 500, 10_000)).toEqual({
      start: 500,
      end: 2500,
    });
    expect(revealPosition(view, 9500, 10_000)).toEqual({
      start: 8000,
      end: 10_000,
    });
  });
});

describe('followPlayback', () => {
  const view = { start: 2000, end: 4000 };

  it('leaves the window alone while the playhead stays in it', () => {
    expect(followPlayback(view, 3000, 3900, 10_000)).toBe(view);
  });

  it('pages forward when the playhead runs off the end', () => {
    expect(followPlayback(view, 3900, 4100, 10_000)).toEqual({
      start: 4000,
      end: 6000,
    });
  });

  it('jumps to the playhead when it moves more than a page at once', () => {
    expect(followPlayback(view, 3900, 7000, 10_000)).toEqual({
      start: 7000,
      end: 9000,
    });
  });

  it('keeps the last page inside the recording', () => {
    expect(
      followPlayback({ start: 8000, end: 9500 }, 9400, 9600, 10_000),
    ).toEqual({ start: 8500, end: 10_000 });
  });

  it('leaves alone a window the user moved away from the playhead', () => {
    const elsewhere = { start: 6000, end: 8000 };

    expect(followPlayback(elsewhere, 3000, 3100, 10_000)).toBe(elsewhere);
    expect(followPlayback(view, 8000, 8100, 10_000)).toBe(view);
  });
});

describe('sliderStep', () => {
  it('moves about a hundredth of the recording, in round steps', () => {
    expect(sliderStep(0)).toBe(100);
    expect(sliderStep(2200)).toBe(100);
    expect(sliderStep(22_000)).toBe(200);
    expect(sliderStep(275_000)).toBe(2000);
    expect(sliderStep(3_600_000)).toBe(30_000);
    expect(sliderStep(36_000_000)).toBe(60_000);
  });
});
