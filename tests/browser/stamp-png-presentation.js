import { readFileSync } from 'node:fs';

// Independent presentation oracle: original PNG bytes, explicit source-space
// placements and clips. Never reads the actor, its pixels or application code.
// Keep the separate raw-RGBA source pins: engine PNG premultiplication is not
// the same contract as the source's straight-alpha integer composition.
export async function stampPngPresentation(page, bounds, layers) {
  const inputs = layers.map(layer => ({ ...layer,
    image: layer.image ?? `data:image/png;base64,${readFileSync(`public/original/ui/${layer.path}`).toString('base64')}`,
  }));
  const data = await page.evaluate(async ({ bounds, inputs }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 768;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.beginPath(); context.rect(...bounds); context.clip();
    for (const layer of inputs) {
      const image = new Image(); image.src = layer.image; await image.decode();
      context.save();
      if (layer.clip) { context.beginPath(); context.rect(...layer.clip); context.clip(); }
      context.drawImage(image, layer.x, layer.y);
      context.restore();
    }
    return Array.from(context.getImageData(...bounds).data);
  }, { bounds, inputs });
  return { width: bounds[2], height: bounds[3], data: Buffer.from(data) };
}
