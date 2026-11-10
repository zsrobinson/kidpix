import { attachMode1Motion } from './native-library-motion.js';

export const toolTabBindings = ['mixer', 'grab', 'eraser', 'text', 'stamp', 'draw', 'paint', 'fill']
  .map(name => ({ name, action: `tray:${name === 'fill' ? 'bucket' : name}` }));

// First display and fallback adoption are explicit browser policies. Application
// tray commits, rather than ARIA or the last command, own the selected state.
export function attachToolTabMotion(manifest, root, sprites, layer, options) {
  return attachMode1Motion(manifest, root, sprites, layer, {
    ...options, bindings: toolTabBindings, terminalAdoption: true,
    actorAttribute: 'nativeToolTabMotion',
  });
}
