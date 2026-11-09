import { original } from './library.js';
import { place } from './trays.js';

export function frameAtTick(frames, tick) {
  let end = 0;
  for (let index = 0; index < frames.length; index++) {
    end += frames[index].ticks;
    if (tick < end) return index;
  }
  return -1;
}

export function createNativeAnimation(layer, idle, playSound) {
  const image = document.createElement('img');
  image.className = 'native-sprite native-animation';
  image.alt = '';
  image.hidden = true;
  layer.append(image);
  let generation = 0;
  let animationFrame;
  const decoded = new Map();

  function stop() {
    generation++;
    cancelAnimationFrame(animationFrame);
    image.hidden = true;
    idle.hidden = false;
  }

  async function play(clip, tickMs) {
    stop();
    const current = generation;
    try {
      await Promise.all(clip.frames.map(frame => {
        if (!decoded.has(frame.image)) {
          const asset = new Image();
          asset.src = original(`ui/${frame.image}`);
          decoded.set(frame.image, asset.decode().catch(error => { decoded.delete(frame.image); throw error; }));
        }
        return decoded.get(frame.image);
      }));
    } catch { return; }
    if (current !== generation) return;
    image.style.cssText = place(...clip.rect);
    image.dataset.script = String(clip.script);
    idle.hidden = true;
    image.hidden = false;
    const start = performance.now();
    let nextSound = 0;
    let previousFrame = -1;
    function step(now) {
      if (current !== generation) return;
      const tick = Math.floor((now - start) / tickMs);
      while (nextSound < clip.sounds.length && clip.sounds[nextSound].tick <= tick) playSound(clip.sounds[nextSound++].sound);
      const frame = frameAtTick(clip.frames, tick);
      if (frame < 0) { stop(); return; }
      if (frame !== previousFrame) {
        image.src = original(`ui/${clip.frames[frame].image}`);
        previousFrame = frame;
      }
      animationFrame = requestAnimationFrame(step);
    }
    step(start);
  }
  return { play, stop };
}
