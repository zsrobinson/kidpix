import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXT_SIZES, TEXT_FONTS, sizeStep, fontStep, editedSize } from '../../src/text-values.js';
test('all 23 native presets step without wrap', () => {
  assert.deepEqual(TEXT_SIZES, [7,9,10,12,14,16,18,20,22,24,28,32,36,48,72,96,120,144,168,192,240,288,336]);
  TEXT_SIZES.forEach((value, index) => {
    assert.equal(sizeStep(value, -1), TEXT_SIZES[index - 1] ?? null);
    assert.equal(sizeStep(value, 1), TEXT_SIZES[index + 1] ?? null);
    assert.equal(editedSize(String(value)), value);
  });
  assert.equal(sizeStep(42, 1),48); assert.equal(sizeStep(42,-1),36);
  assert.equal(editedSize('42'),42); assert.equal(editedSize(''),null);
  assert.equal(editedSize('garbage'),null); assert.equal(editedSize('2'),7); assert.equal(editedSize('400'),336);
  assert.equal(sizeStep(undefined,1),null);
});
test('portable catalog bounds, empty, singleton and retained unknown identity', () => {
  assert.deepEqual(TEXT_FONTS.map(f => f.value), ['Chalkboard, sans-serif','serif','sans-serif','monospace']);
  TEXT_FONTS.forEach((font,index) => {
    assert.equal(fontStep(font.value,-1),TEXT_FONTS[index-1]?.value ?? null);
    assert.equal(fontStep(font.value,1),TEXT_FONTS[index+1]?.value ?? null);
  });
  for (const direction of [-1,1]) {
    assert.equal(fontStep('unknown',direction),null);
    assert.equal(fontStep('serif',direction,[]),null);
    assert.equal(fontStep('serif',direction,[{value:'serif'}]),null);
  }
});
