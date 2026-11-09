import { original } from './library.js';
import { drawNativeSprayFrame, nativeSprayFrameAt, selectNativeSprayClip } from './native-spray-runtime.js';

function integerPoint(point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Moving-paint point must be finite');
  // Browser coordinates can be fractional; floor into native page pixels so
  // a pointer just outside the left/top edge cannot become an in-bounds -0.
  return { x: Math.floor(point.x), y: Math.floor(point.y) };
}

function playSourceSound(cue) {
  if (typeof Audio === 'undefined' || !cue.src) return null;
  const audio = new Audio(original(cue.src));
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  let settled = false;
  const complete = () => {
    if (settled) return;
    settled = true;
    audio.removeEventListener('ended', complete);
    audio.removeEventListener('error', complete);
    finish();
  };
  audio.addEventListener('ended', complete);
  audio.addEventListener('error', complete);
  try { Promise.resolve(audio.play()).catch(complete); }
  catch { complete(); }
  return { finished, stop() { audio.pause(); complete(); } };
}

/**
 * Owns finite native moving-paint actors, not the paint layer or undo history.
 * playSound(cue, actor) may return { finished: Promise, stop() }; null is muted.
 * onCommit(actor, frame) runs before the actor leaves the live list.
 */
export function createNativeMovingPaint({
  now = () => performance.now(),
  schedule = callback => requestAnimationFrame(callback),
  cancel = handle => cancelAnimationFrame(handle),
  random = Math.random,
  containsPoint = () => true,
  playSound = playSourceSound,
  onFrame = () => {},
  onCommit = () => {},
} = {}) {
  const actors = [];
  let held = null;
  let scheduled = null;
  let epoch = 0;
  let nextId = 1;

  function stopAudio(actor) {
    for (const sound of actor.audio.values()) {
      sound.pending = false;
      try { sound.handle.stop?.(); } catch { /* A failed sound must not prevent cleanup. */ }
    }
    actor.audio.clear();
  }

  function stopSchedule() {
    epoch++;
    if (scheduled !== null) cancel(scheduled);
    scheduled = null;
  }

  function ensureSchedule() {
    if (scheduled !== null || (!held && !actors.length)) return;
    const token = epoch;
    scheduled = schedule(() => {
      if (token !== epoch) return;
      scheduled = null;
      tick();
    });
  }

  function startSound(actor, cue) {
    const channel = cue.channel ?? 1;
    const previous = actor.audio.get(channel);
    if (previous) {
      previous.pending = false;
      try { previous.handle.stop?.(); } catch { /* Continue with the replacement cue. */ }
      actor.audio.delete(channel);
    }
    let handle;
    try { handle = playSound(cue, actor); }
    catch { return; }
    if (!handle) return;
    const sound = { handle, pending: Boolean(handle.finished?.then) };
    actor.audio.set(channel, sound);
    if (sound.pending) {
      const complete = () => {
        if (actor.removed || actor.audio.get(channel) !== sound) return;
        sound.pending = false;
        ensureSchedule();
      };
      Promise.resolve(handle.finished).then(complete, complete);
    }
  }

  function updateActor(actor, time) {
    const age = Math.max(0, time - actor.startedAt);
    const sounds = actor.clip.sounds || [];
    while (actor.soundCursor < sounds.length && sounds[actor.soundCursor].atMs <= age) {
      startSound(actor, sounds[actor.soundCursor++]);
    }
    const frame = nativeSprayFrameAt(actor.clip, age);
    const changed = frame !== actor.frame;
    actor.frame = frame;
    return changed;
  }

  function commit(actor, frame) {
    if (actor.removed) return;
    actor.frame = frame;
    try { onCommit(actor, frame); }
    finally {
      actor.removed = true;
      const index = actors.indexOf(actor);
      if (index !== -1) actors.splice(index, 1);
      stopAudio(actor);
    }
  }

  function emit(point, bundle, time) {
    const position = integerPoint(point);
    if (!containsPoint(position)) return null;
    const clipId = selectNativeSprayClip(bundle.bank, random);
    const clip = bundle.clips[clipId];
    if (!clip?.frames?.length || !Number.isFinite(clip.minimumCompletionMs)) {
      throw new Error('Native moving-paint clip is missing source timing');
    }
    const actor = { id: nextId++, bundle, clip, point: position, startedAt: time,
      audio: new Map(), soundCursor: 0, frame: null, removed: false };
    actors.push(actor);
    updateActor(actor, time);
    return actor;
  }

  function tick() {
    const time = now();
    let changed = false;
    if (held && time >= held.nextEmission) {
      const emitted = emit(held.point, held.bundle, time);
      // Native timers deliver current events. Do not invent a burst of old
      // particles at one pointer position after a delayed browser callback.
      held.nextEmission = time + 150;
      changed = Boolean(emitted);
    }
    for (const actor of [...actors]) {
      if (actor.removed) continue;
      changed = updateActor(actor, time) || changed;
      const pending = [1, 2].some(channel => actor.audio.get(channel)?.pending);
      if (time - actor.startedAt >= actor.clip.minimumCompletionMs && !pending) {
        commit(actor, actor.frame);
        changed = true;
      }
    }
    if (changed) onFrame();
    ensureSchedule();
  }

  return {
    begin(point, bundle) {
      const time = now();
      const position = integerPoint(point);
      const actor = emit(position, bundle, time);
      held = { point: position, bundle, nextEmission: time + 150 };
      onFrame();
      ensureSchedule();
      return actor;
    },
    move(point) {
      if (held) held.point = integerPoint(point);
    },
    end() {
      held = null;
      ensureSchedule();
    },
    drawTo(context) {
      const time = now();
      let drawn = 0;
      for (const actor of actors) {
        const frame = nativeSprayFrameAt(actor.clip, Math.max(0, time - actor.startedAt));
        if (frame) drawn += drawNativeSprayFrame(context, actor.point, actor.clip, actor.bundle.bank, frame, actor.bundle.imageFor);
      }
      return drawn;
    },
    flush() {
      held = null;
      stopSchedule();
      const current = [...actors];
      const time = now();
      for (const actor of current) commit(actor, nativeSprayFrameAt(actor.clip, Math.max(0, time - actor.startedAt)));
      if (current.length) onFrame();
      return current.length;
    },
    discard() {
      held = null;
      stopSchedule();
      const count = actors.length;
      for (const actor of actors) { actor.removed = true; stopAudio(actor); }
      actors.length = 0;
      if (count) onFrame();
      return count;
    },
    get active() { return Boolean(held || actors.length); },
  };
}
