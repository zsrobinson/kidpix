import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Decode only after timing. Retain encoded identity separately from pixel identity.
export function snapshotPNG(dataURL) {
 const bytes = Buffer.from(dataURL.split(',')[1], 'base64');
 const png = PNG.sync.read(bytes);
 return { pixelHash:hash(dataURL), pngHash:hash(bytes), pngBytes:bytes.length,
  pngColorType:bytes[25], width:png.width, height:png.height, rgbaBytes:png.data.length,
  rgbaHash:hash(png.data) };
}

export function samePixels(left, right) {
 return left.width === right.width && left.height === right.height && left.rgbaHash === right.rgbaHash;
}
