// Strict benchmark instrumentation; never imported by the application.
import assert from 'node:assert/strict';
const patch=(code,seam,replacement)=>{assert.equal(code.split(seam).length,2,`seam ${seam}`);return code.replace(seam,replacement);};
export function coldPaintTransform(code, {instrument=false}={}) {
 code=patch(code,'makeRandom(Math.floor(point.x * 14399 + point.y * 131 + performance.now()))','makeRandom(53)');
 if(instrument){
  code=patch(code,'function setOptions(next) {','function setOptions(next) { window.coldLog?.push({kind:"options",t:performance.now(),next,contact});');
  code=patch(code,'function cancel() {','function cancel() { window.coldLog?.push({kind:"cancel",t:performance.now(),contact});');
  code=patch(code,'function strokeTo(current, end, targetContext = preview) {','function strokeTo(current, end, targetContext = preview) { if (targetContext === preview) window.coldLog?.push({kind:"sample",t:performance.now(),end,contact});');
  code=patch(code,'function render() {','function render() { window.coldLog?.push({kind:"render",t:performance.now(),contact});');
 }
 return code;
}
