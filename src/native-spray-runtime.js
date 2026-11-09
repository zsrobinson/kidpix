// These operations reproduce the source renderer's registration and index
// rules. Particle emission and asynchronous asset loading belong to the caller.

export function selectNativeShape(bank, random = Math.random, first = false) {
  const count = bank.frameCount;
  if (!Number.isInteger(count) || count < 1 || bank.frames.length < count) {
    throw new RangeError('Native spray bank has an invalid frame count');
  }
  if (first) return bank.frames[0];
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Random value must be between zero and one');
  // RCyclicBitmap starts with image 1. Later choices use the native rounded
  // one-based formula; the last bank entry is not normally selected.
  const oneBased = 1 + Math.trunc(value * (count - 2) + 0.5);
  return bank.frames[oneBased - 1];
}

export function selectNativeSprayClip(bank, random = Math.random) {
  const count = bank.clipIds.length;
  if (!count) throw new RangeError('Native moving-spray bank has no clips');
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Random value must be between zero and one');
  return bank.clipIds[Math.trunc(value * (count - 1) + 0.5)];
}

export function drawNativeShape(context, point, frame, image) {
  const x = point.x - frame.registration[0];
  const y = point.y - frame.registration[1];
  drawSource(context, image, frame, x, y);
  return { x, y, width: frame.width, height: frame.height };
}

function drawSource(context, image, frame, x, y) {
  if (frame.sourceRect) context.drawImage(image, ...frame.sourceRect, x, y, frame.width, frame.height);
  else context.drawImage(image, x, y, frame.width, frame.height);
}

export function nativeSprayFrameAt(clip, elapsedMs) {
  if (!clip.frames.length) return null;
  const time = Math.max(0, elapsedMs);
  let selected = clip.frames[0];
  for (const frame of clip.frames) {
    if (frame.atMs > time) break;
    selected = frame;
  }
  // The finite native actor's completion callback commits the terminal image.
  // Sampling does not invent a wraparound or decide the sound-gated lifetime.
  return selected;
}

export function drawNativeSprayFrame(context, point, clip, bank, frame, imageFor) {
  const anchor = clip.firstDrawRawPosition;
  if (!anchor) throw new Error('Native moving-spray clip has no source relocation anchor');
  let drawn = 0;
  for (const part of frame.parts) {
    const source = bank.frames[part.frame];
    const image = imageFor(source.image);
    if (!image) continue;
    // The emitter subtracts the first raw draw position. The exporter has
    // already subtracted each image's registration from part.x/part.y.
    drawSource(context, image, source, point.x - anchor[0] + part.x, point.y - anchor[1] + part.y);
    drawn++;
  }
  return drawn;
}
