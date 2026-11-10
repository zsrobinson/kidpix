import { observeUiAudio } from './ui-audio.js';
import { original } from './library.js';
import { place } from './trays.js';

export function frameAtTick(frames, tick) {
  let end = 0;
  for (let index = 0; index < frames.length; index++) {
    end += frames[index].ticks;
    if (tick < end) return index;
  }
  // End is encountered in this update; finite-playback completion is checked
  // on the next one (i386 0x15a6e4–0x15a72b, 0x15a304–0x15a372).
  return frames.length && tick < end + 1 ? frames.length - 1 : -1;
}

export function createNativeAnimation(layer, idle, playSound, { schedule = setTimeout, cancel = clearTimeout, url = original } = {}) {
  const image = document.createElement('img');
  image.className = 'native-sprite native-animation';
  image.alt = '';
  image.hidden = true;
  layer.append(image);
  let generation = 0;
  let animationFrame;
  const decoded = new Map();
  const ownedSounds = new Map();
  const pendingSounds = new Map();
  const soundCleanup = new Map();

  function stop() {
    generation++;
    cancel(animationFrame);
    image.hidden = true;
    idle.hidden = false;
    for (const cleanup of soundCleanup.values()) cleanup();
    soundCleanup.clear();
    for (const audio of ownedSounds.values()) audio.pause();
    ownedSounds.clear();
    pendingSounds.clear();
  }

  // A caller may return the Audio it starts. Without a handle, retain the
  // existing fire-and-forget contract; sound completion cannot be inferred.
  function cueSound(cue) {
    const channel = cue.channel ?? 1;
    const previous = ownedSounds.get(channel);
    if (previous) {
      soundCleanup.get(previous)?.();
      soundCleanup.delete(previous);
      previous.pause();
      pendingSounds.delete(previous);
      ownedSounds.delete(channel);
    }
    const audio = playSound(cue.sound, channel);
    if (!audio?.addEventListener || !audio.pause || audio.ended || audio.error) return;
    ownedSounds.set(channel, audio);
    pendingSounds.set(audio, channel);
    const finished = () => {
      soundCleanup.delete(audio);
      pendingSounds.delete(audio);
      if (ownedSounds.get(channel) === audio) ownedSounds.delete(channel);
    };
    soundCleanup.set(audio, observeUiAudio(audio, finished));
  }

  async function play(clip, tickMs) {
    stop();
    const current = generation;
    try {
      await Promise.all(clip.frames.map(frame => {
        if (!decoded.has(frame.image)) {
          const asset = new Image();
          asset.src = url(`ui/${frame.image}`);
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
    let nextSound = 0;
    let previousFrame = -1;
    let tick = 0;
    const endTick = clip.frames.reduce((sum, frame) => sum + frame.ticks, 0);
    function step() {
      if (current !== generation) return;
      while (nextSound < clip.sounds.length && clip.sounds[nextSound].tick <= tick) {
        cueSound(clip.sounds[nextSound++]);
        if (current !== generation) return;
      }
      const waitingForSound = [...pendingSounds.values()].some(channel => channel === 1 || channel === 2);
      if (tick > endTick && !waitingForSound) { stop(); return; }
      const frame = frameAtTick(clip.frames, Math.min(tick, endTick));
      if (frame < 0) { stop(); return; }
      if (frame !== previousFrame) {
        image.src = url(`ui/${clip.frames[frame].image}`);
        image.dataset.frame = String(frame);
        previousFrame = frame;
      }
      // This actor's flags do not enable elapsed-time catch-up. Each delivered
      // update schedules its next deadline from the current time (0x15a2ed).
      // Keep every authored pose, including the terminal update, after a stall.
      tick++;
      animationFrame = schedule(step, tickMs);
    }
    step();
  }
  return { play, stop };
}
