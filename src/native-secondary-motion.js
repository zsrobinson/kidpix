import { createMode2MotionController, loadDrawingMotionAssets } from './native-drawing-motion.js';
import { createNativeToolMotion } from './native-tool-motion.js';
import { regionClipPath } from './native-control-regions.js';

const styles = ['line', 'curve', 'rectangle', 'filled-rectangle', 'ellipse',
  'filled-ellipse', 'polygon', 'filled-polygon', 'freehand'];

// Explicit application bindings, independent of the native command argument.
// Unsupported action/toggle modes remain static until their dispatch is recovered.
export function secondaryProfiles({ tray, selected, eraserShape }) {
  const profiles = [];
  if (tray === 'draw') profiles.push({ slot: 'style', table: 18400, rows: styles.map((style, i) => [i + 4, `style:${style}`]) });
  if (tray === 'paint') profiles.push({ slot: 'mode', table: selected === 'sound' ? 18002 : selected === 'spray' ? 18003 : 18001,
    rows: [[0, 'mode:false'], [1, 'mode:true']] });
  if (tray === 'eraser' && selected !== 'big') profiles.push({ slot: 'shape', table: 18203,
    rows: [[0, 'eraser-shape:round'], [1, 'eraser-shape:square']] });
  // Native loaders: Drawing0x000f341e, Painting0x000f4200 and Mixer0x000f27d6
  // load18200; Eraser0x000efc6a–0x000efcbf chooses18200/18201 by shape.
  if (['draw', 'paint', 'mixer'].includes(tray) || tray === 'eraser' && selected !== 'big') {
    profiles.push({ slot: 'size', table: tray === 'eraser' && eraserShape === 'square' ? 18201 : 18200,
      rows: [[0, 'size:4'], [1, 'size:8'], [2, 'size:16']] });
  }
  return profiles;
}

export function secondaryManifest(data, profile) {
  const table = data.tables?.[profile.table];
  const sourceButtons = Array.isArray(table) ? table : table?.buttons;
  if (!sourceButtons) return null;
  const scripts = {};
  const sprites = {};
  const buttons = profile.rows.map(([row, action]) => {
    const source = sourceButtons.find(button => button.index === row);
    if (!source || source.stateScripts[2] || !source.stateScripts[3] || !regionClipPath(source.region)
      || source.rolloverParameters?.some(Boolean)) throw new Error(`Unsupported secondary selector ${profile.table}:${row}`);
    for (const id of [...source.stateScripts, source.rolloverScript].filter(Boolean)) {
      const clip = data.scripts[String(id)];
      if (!clip) throw new Error(`Missing secondary program ${id}`);
      scripts[id] = { ...clip, script: id, frames: clip.frames.map(frame => ({ ...frame,
        parts: frame.parts.map(part => {
          const key = `${clip.collection}:${part.sprite}`;
          const sprite = data.sprites[key];
          if (!sprite) throw new Error(`Missing secondary sprite ${key}`);
          sprites[key] = sprite;
          return { ...part, sprite: key };
        }),
      })) };
    }
    return { ...source, mode: 2, name: action, action };
  });
  return { buttons, scripts, sprites, sounds: data.sounds, renderMode: 'ordinary' };
}

// Each independent source group retains one owner across application rerenders.
// Separate canvases restore only their source pose bounds from clean backdrops;
// primary actor restoration and live option art retain their own ownership.
export function createNativeSecondaryMotion({ stage, controls, resolve, onReady, onActivate, fetch }) {
  const instances = new Map();
  const layerRoot = stage.querySelector('#native-tool-motion');
  function instance(slot) {
    if (instances.has(slot)) return instances.get(slot);
    const layer = stage.ownerDocument.createElement('div');
    layer.className = 'chrome native-secondary-motion';
    layer.hidden = true;
    layerRoot.after(layer);
    const motion = createNativeToolMotion({ stage, layer, controls, resolve, onReady, onActivate, fetch,
      manifestPath: 'secondary-motion/manifest.json',
      canvasAttribute: 'nativeSecondaryMotion',
      manifestFor: (data, current) => secondaryManifest(data, current.profile),
      backdropFor(data, current) {
        const backdrop = data.backdrops?.[current.art];
        const page = backdrop?.pages?.[current.page];
        return page && { path: page.image, rect: backdrop.rect };
      },
      loadAssets: loadDrawingMotionAssets,
      createController: createMode2MotionController,
      actionForButton: button => button.action,
      supported: tray => tray !== 'inactive',
    });
    const result = { motion, layer };
    instances.set(slot, result);
    return result;
  }
  return {
    beforeRender() { instances.forEach(({ motion }) => motion.beforeRender()); },
    update(current) {
      const actionControls = [...controls.querySelectorAll('[data-action]')];
      const profiles = secondaryProfiles(current).filter(profile => profile.rows.every(([, action]) =>
        actionControls.some(control => control.dataset.action === action)));
      const active = new Set(profiles.map(profile => profile.slot));
      for (const [slot, { motion }] of instances) if (!active.has(slot)) motion.update({ tray: 'inactive' });
      for (const profile of profiles) {
        // Do not animate invisible controls (e.g. owner-specific disabled sizes).
        const selected = profile.rows.find(([, action]) => [...controls.querySelectorAll('[data-action]')]
          .some(control => control.dataset.action === action && control.getAttribute('aria-pressed') === 'true'))?.[1];
        const ready = instance(profile.slot).motion.update({ ...current, tray: `${current.tray}:${profile.table}`, profile, selected });
        if (ready && profile.slot === 'size') {
          controls.querySelectorAll('[data-native-part^="size-"], [data-native-part="tray-size"]').forEach(image => { image.hidden = true; });
        }
      }
    },
    cancel() { instances.forEach(({ motion }) => motion.cancel()); },
    dispose() { instances.forEach(({ motion, layer }) => { motion.dispose(); layer.remove(); }); instances.clear(); },
  };
}
