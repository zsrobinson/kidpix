import { actionManifest } from './native-action-motion.js';
import { createActionStateController } from './native-action-state.js';
import { createNativeToolMotion } from './native-tool-motion.js';

export const categoryProfile = Object.freeze({ table: 18901, rows: Object.freeze([1, 2]), bounds: Object.freeze([320,690,43,62]) });

export function categoryStates(manifest, { categoryIndex, categoryCount }) {
  const valid = Number.isInteger(categoryIndex) && Number.isInteger(categoryCount)
    && categoryCount > 0 && categoryIndex >= 0 && categoryIndex < categoryCount;
  return manifest.buttons.map(button => {
    // Empty/invalid lists are a browser capability policy: safely show both
    // disabled slots, without changing the application's displayed fallback.
    const boundary = !valid || (button.index === 1 ? categoryIndex === 0 : categoryIndex === categoryCount - 1);
    return { active: false, boundary, disabled: boundary };
  });
}

// Logical list membership, not filtered-array allocation or item contents.
export function createCategoryIdentity() {
  const ids = new WeakMap(); let sequence = 0;
  const id = object => {
    if (!object) return 0;
    if (!ids.has(object)) ids.set(object, ++sequence);
    return ids.get(object);
  };
  return ({ key, tab, source, categories, imported, categoryIndex }) =>
    JSON.stringify([key,tab,id(source),categories.map(id),id(imported),imported?.length ?? 0,categoryIndex]);
}

export function createNativeCategoryMotion({ stage, controls, resolve, readState, onActivate, ...options }) {
  const layer = stage.ownerDocument.createElement('div');
  layer.className = 'chrome native-secondary-motion';
  layer.dataset.categoryOwner = '18901';
  layer.style.zIndex = '1'; layer.hidden = true; stage.append(layer);
  const stateFor = value => ({ ...value, profile: categoryProfile, color: '#000000', art: 'library-category', page: 0,
    tray: value.active && value.nativeUi ? 'library-category:18901' : 'inactive' });
  const motion = createNativeToolMotion({ ...options, stage, controls, layer, resolve, onActivate,
    ownInteraction: true, fallbackActions: ['category-step:-1', 'category-step:1'],
    manifestPath: 'secondary-motion/manifest.json', canvasAttribute: 'nativeCategoryMotion',
    manifestFor: data => actionManifest(data, categoryProfile),
    backdropFor: data => {
      const backdrop = data.backdrops?.['library-category'];
      return backdrop && { path: backdrop.pages[0].image, rect: backdrop.rect };
    },
    createController: createActionStateController, actionForButton: button => button.action,
    authoritativeFor: categoryStates, targetFor: value => value.identity,
    supported: tray => tray !== 'inactive', refreshCurrent: () => stateFor(readState()),
    // Decode readiness binds the existing semantic nodes, including captured
    // nodes. It must never rerender the library DOM.
    onReady: () => motion.update(stateFor(readState())),
  });
  return { ...motion, update: value => motion.update(stateFor(value)),
    dispose() { motion.dispose(); layer.remove(); } };
}
