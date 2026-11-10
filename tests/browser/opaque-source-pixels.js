// Compare every RGB byte covered by fully opaque source art. Transparent source
// pixels belong to the studio backing; actual alpha remains outside this oracle.
export function compareOpaqueSourcePixels(actual, expected) {
  if (actual.width !== expected.width || actual.height !== expected.height) throw new Error('Source composition dimensions differ');
  let compared = 0, mismatched = 0, firstMismatch = null;
  for (let i = 0; i < expected.data.length; i += 4) {
    if (expected.data[i + 3] !== 255) continue;
    compared++;
    if (actual.data[i] !== expected.data[i] || actual.data[i + 1] !== expected.data[i + 1] || actual.data[i + 2] !== expected.data[i + 2]) {
      mismatched++;
      firstMismatch ??= { x: i / 4 % expected.width, y: Math.floor(i / 4 / expected.width),
        actual: [...actual.data.subarray(i, i + 3)], expected: [...expected.data.subarray(i, i + 3)] };
    }
  }
  return { compared, mismatched, firstMismatch };
}
