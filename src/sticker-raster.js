// Private ownership registry: callers cannot forge or mutate prepared pixels.
const rasters = new WeakMap();
export function prepareStickerRaster(canvas, bounds, owner) {
  const { x, y, width, height } = bounds;
  if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0
    || width < 1 || height < 1 || canvas.width !== width || canvas.height !== height) return null;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  if (!pixels.some((value, index) => index % 4 === 3 && value)) return null;
  const token = Object.freeze({});
  rasters.set(token, Object.freeze({ x, y, width, height, owner, src: canvas.toDataURL('image/png') }));
  return token;
}
export const stickerRaster = token => rasters.get(token) ?? null;
