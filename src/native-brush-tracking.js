// RRealMedia tracking (0x001223f4), RTool line helper (0x00137556).
// Coordinates are native integer image coordinates, before brush oscillation.
const MAX_SEGMENT_DELTA = 16383;

function unsignedWord(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new RangeError(`${name} must be an unsigned 16-bit integer`);
  }
  return value;
}

function point(value) {
  if (!value || !Number.isInteger(value.x) || !Number.isInteger(value.y)
      || value.x < -32768 || value.x > 32767 || value.y < -32768 || value.y > 32767) {
    throw new RangeError('Brush coordinates must be signed 16-bit integers');
  }
  return { x: value.x, y: value.y };
}

// Setup copies nonzero CFG spacing; zero retains the existing tool field.
// A newly constructed tool starts at 3. Marker then multiplies by 1.5.
export function resolveNativeBrushLineSpacing({ spacing, previousLineSpacing = 3, marker = false }) {
  unsignedWord(spacing, 'spacing');
  unsignedWord(previousLineSpacing, 'previousLineSpacing');
  const value = spacing || previousLineSpacing;
  return marker ? Math.trunc(value * 1.5) & 0xffff : value;
}

/**
 * Return native line emissions as absolute centers and relative dab deltas.
 * The start is excluded. The endpoint is emitted once, including any residual
 * shorter than lineSpacing. No residual passes into the next segment.
 */
export function nativeBrushLine(start, end, lineSpacing) {
  const from = point(start);
  const to = point(end);
  unsignedWord(lineSpacing, 'lineSpacing');
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  // The native helper doubles and compares signed 16-bit deltas. Normal page
  // coordinates fit this domain; overflow outside it is deliberately unmodeled.
  if (width > MAX_SEGMENT_DELTA || height > MAX_SEGMENT_DELTA) {
    throw new RangeError('Native brush segment exceeds the verified integer domain');
  }
  if (width === 0 && height === 0) return [];

  const sx = to.x < from.x ? -1 : 1;
  const sy = to.y < from.y ? -1 : 1;
  const xMajor = width > height; // Native equality chooses the y-major branch.
  const major = xMajor ? width : height;
  const minor = xMajor ? height : width;
  let error = 2 * minor - major;
  let x = from.x;
  let y = from.y;
  let emittedX = x;
  let emittedY = y;
  let pendingSteps = 0;
  const emissions = [];

  function emit() {
    emissions.push({ x, y, dx: x - emittedX, dy: y - emittedY });
    emittedX = x;
    emittedY = y;
    pendingSteps = 0;
  }

  for (let step = 0; step < major; step += 1) {
    if (error >= 0) {
      if (xMajor) y += sy;
      else x += sx;
      error -= 2 * major;
    }
    error += 2 * minor;
    if (xMajor) x += sx;
    else y += sy;
    pendingSteps += 1;
    if (pendingSteps >= lineSpacing) emit();
  }
  if (pendingSteps !== 0) emit();
  return emissions;
}

/**
 * Native brush stroke state, independent of browser event/timer scheduling.
 * Feed actual integer pointer samples to track(), including stationary polls
 * when available. The caller owns rendering, RNG, history and pointer capture.
 */
export function createNativeBrushTracking({ spacing, lineSpacing = resolveNativeBrushLineSpacing({ spacing }) }) {
  unsignedWord(spacing, 'spacing');
  unsignedWord(lineSpacing, 'lineSpacing');
  let accepted = null;

  return {
    get active() { return accepted !== null; },
    get lastPoint() { return accepted && { ...accepted }; },
    begin(position) {
      accepted = point(position);
      return [{ ...accepted, dx: 0, dy: 0 }];
    },
    track(position) {
      if (!accepted) return [];
      const next = point(position);
      const dx = next.x - accepted.x;
      const dy = next.y - accepted.y;
      if (dx === 0 && dy === 0) {
        return spacing === 0 ? [{ ...accepted, dx: 0, dy: 0 }] : [];
      }
      if (spacing !== 0 && Math.abs(dx) < lineSpacing && Math.abs(dy) < lineSpacing) return [];
      const emissions = nativeBrushLine(accepted, next, lineSpacing);
      accepted = next;
      return emissions;
    },
    end() {
      // Native release does not interpolate to the release pointer position.
      accepted = null;
      return [];
    },
  };
}
