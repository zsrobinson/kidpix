// Portable browser catalog, in the existing order; not native host enumeration.
export const TEXT_FONTS = Object.freeze([
  { value: 'Chalkboard, sans-serif', label: 'Chalkboard' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans-serif', label: 'Sans Serif' },
  { value: 'monospace', label: 'Monospace' },
].map(Object.freeze));
export const TEXT_STEPPERS = Object.freeze([
  { action: 'font-step:-1', label: 'Previous font', x: 257, y: 643, symbol: '▲' },
  { action: 'font-step:1', label: 'Next font', x: 257, y: 674, symbol: '▼' },
  { action: 'font-size-step:1', label: 'Larger font size', x: 334, y: 643, symbol: '▲' },
  { action: 'font-size-step:-1', label: 'Smaller font size', x: 334, y: 674, symbol: '▼' },
].map(Object.freeze));
export const TEXT_SIZES = Object.freeze([7, 9, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72, 96, 120, 144, 168, 192, 240, 288, 336]);
export function fontStep(value, direction, catalog = TEXT_FONTS) {
  const index = catalog.findIndex(entry => entry.value === value);
  return index < 0 ? null : catalog[index + direction]?.value ?? null;
}
// Browser adaptation: retain custom sizes and step to the next strict neighbour.
// The native custom-size path is unverified. Never wrap or coerce saved values.
export function sizeStep(value, direction) {
  if (!Number.isFinite(value)) return null;
  return (direction > 0 ? TEXT_SIZES : [...TEXT_SIZES].reverse())
    .find(size => direction > 0 ? size > value : size < value) ?? null;
}
export function editedSize(value) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number) ? Math.max(7, Math.min(336, number)) : null;
}
export function textStep(current, action) {
  if (!TEXT_STEPPERS.some(stepper => stepper.action === action)) return null;
  const [kind, direction] = action.split(':');
  const value = kind === 'font-step' ? fontStep(current.font, Number(direction), current.fontCatalog)
    : sizeStep(current.textSize, Number(direction));
  return value === null ? null : { [kind === 'font-step' ? 'font' : 'textSize']: value };
}
