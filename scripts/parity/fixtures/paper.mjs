// Resource-shaped metadata for asset-free controller tests. Actual archive
// decoding and PNG pixels are checked separately by import/browser suites.
const body = { sprite: 217, x: 883, y: 533 };
const handle = { sprite: 71, x: 886, y: 539 };
const roller = sprite => ({ sprite, x: 883, y: 524 });
const closed = [roller(68), body, handle];
const textures = Array.from({ length: 21 }, (_, index) => 218 + index);
const pages = [242, 243, 244];
const ids = [68, 69, 70, 71, 109, ...textures, ...pages];

export const paperFixture = {
  version: 1, script: 1055, tickMs: 100, endCheckTick: 6,
  clipRect: [394, 499, 539, 134],
  substitutionParts: { page: 0, texture: 2 },
  textureSprites: textures, pageSprites: pages,
  sprites: Object.fromEntries(ids.map(id => [id, { image: `paper-canister/${id}.png` }])),
  frames: [799, 718, 637, 556, 475, 394].map((x, tick) => ({ tick,
    parts: [{ sprite: 201, x, y: 540 }, roller(68 + tick % 3), body] })),
  states: {
    rest: { script: 1052, frames: [{ tick: 0, parts: closed }], sounds: [], texturePart: 1, endCheckTick: 1, loop: false },
    tracking: { script: 1053, frames: [{ tick: 0, parts: closed }],
      sounds: [{ tick: 0, sound: 1006, channel: 1 }], texturePart: 1, endCheckTick: 1, loop: false },
    hover: { script: 1054, frames: [0, 1, 2].map(tick => ({ tick,
      parts: [roller(68 + tick), body, handle, { sprite: 109, x: 933, y: 582 }] })),
      sounds: [], texturePart: 1, endCheckTick: 3, loop: true },
  },
};
