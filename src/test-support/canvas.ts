// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 14cux-gauge contributors

/**
 * An object on which every method is a no-op that returns another such
 * object, and every property assigned can be read back.
 */
function inert(initial: Record<PropertyKey, unknown> = {}): object {
  const noop = (): object => inert({ width: 10 });

  return new Proxy(initial, {
    get: (target, prop) => (prop in target ? target[prop] : noop),
    set: (target, prop, value) => {
      target[prop] = value;

      return true;
    },
  });
}

/**
 * jsdom neither lays out nor paints, so it has no 2D canvas, `Path2D` or
 * `matchMedia`, and every element is 0 px wide; the graphs' chart library
 * needs all of these. These inert stand-ins let a real chart be built, sized
 * and drawn in a unit test. Nothing is painted, and nothing in the tests
 * depends on what would be. Returns a function that removes them again.
 */
export function installCanvasStandIns({ width = 400 } = {}): () => void {
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (this: HTMLCanvasElement) {
      return inert({ canvas: this }) as CanvasRenderingContext2D;
    });
  const clientWidth = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(width);

  vi.stubGlobal('Path2D', function Path2D() {
    return inert();
  });
  vi.stubGlobal('matchMedia', () => inert({ matches: false }));

  return () => {
    getContext.mockRestore();
    clientWidth.mockRestore();
    vi.unstubAllGlobals();
  };
}
