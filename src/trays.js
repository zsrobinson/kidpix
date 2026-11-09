export const toolGroups = [
  ['draw', 'Drawing Tools', 25, 364, 51, 52],
  ['paint', 'Painting Tools', 77, 364, 55, 52],
  ['bucket', 'Paint Bucket Tools', 25, 426, 51, 52],
  ['mixer', 'Mixer Tools', 77, 426, 55, 52],
  ['stamp', 'Rubber Stamp Tools', 25, 489, 51, 52],
  ['text', 'Text Tools', 77, 489, 55, 52],
  ['grab', 'Grab Tools', 25, 552, 51, 52],
  ['eraser', 'Eraser Tools', 77, 552, 55, 52],
];

export const libraryGroups = [
  ['backgrounds', 'Backgrounds', 16, 13, 131, 73],
  ['stickers', 'Stickers', 20, 85, 130, 67],
  ['toons', 'Animations', 24, 151, 130, 68],
  ['media', 'Sounds & Movies', 2, 217, 130, 76],
];

export const commandButtons = [
  ['undo', 'Undo', 25, 314, 34, 43],
  ['undo', 'Undo Guy', 58, 306, 46, 54],
  ['redo', 'Redo', 103, 313, 32, 44],
  ['play', 'Play Picture', 901, 16, 110, 106],
  ['save', 'Save Picture', 898, 146, 57, 56],
  ['stereo', 'Export to 3D', 955, 146, 56, 56],
  ['new', 'Create New Picture', 898, 206, 57, 56],
  ['print', 'Print Picture', 955, 206, 56, 56],
  ['help', 'Extended Help', 957, 282, 54, 50],
  ['clear', 'Firehose Screen Eraser', 908, 333, 95, 123],
  ['quit', 'Close Picture', 912, 465, 89, 72],
  ['paper', 'Paper Texture Canister', 886, 526, 47, 100],
  ['flipbook', 'Add Picture to Slide Show', 932, 590, 79, 96],
  ['slideshow', 'Go to Slide Show', 932, 696, 83, 54],
];

const sizes = [[4, 'Small'], [8, 'Medium'], [16, 'Large']];
const drawStyles = [
  ['freehand', 'Freestyle Line', 752, 93, 128, 150],
  ['line', 'Straight Line', 887, 80, 134, 80],
  ['curve', 'Curved Line', 887, 162, 134, 83],
  ['rectangle', 'Box Outline', 1036, 80, 136, 79],
  ['filled-rectangle', 'Filled Box', 1036, 160, 136, 83],
  ['ellipse', 'Circle Outline', 1186, 80, 155, 79],
  ['filled-ellipse', 'Filled Circle', 1186, 160, 155, 83],
  ['polygon', 'Shape Outline', 1351, 80, 157, 79],
  ['filled-polygon', 'Filled Shape', 1351, 160, 157, 83],
];

export const paintStyles = {
  paint: [
    ['watercolor', 'Airbrush', 'Oil Paint', 'Gouache', 'Splatter'],
    ['Dry Brush', 'Charcoal', 'Pastel', 'Watercolor Wash', 'Sponge'],
  ],
  wacky: [
    ['Kaleidoscope', 'Drips', 'Rainbow Swirl', 'Confetti', 'Swirl'],
    ['Stars', 'Bubbles', 'Hearts', 'Lightning', 'Ribbon'],
  ],
  sound: [['Bubbles', 'Flowers', 'Rainbow', 'Confetti', 'Sprinkle']],
  spray: [['Balloons', 'Candies', 'Bugs', 'Blocks', 'Shells'], ['Stars', 'Hearts', 'Flowers', 'Bubbles', 'Confetti']],
  'moving-spray': [['Balloons', 'Bubbles', 'Ladybugs', 'Pigs', 'Caterpillars']],
  bucket: [['solid', 'swirl', 'crosshatch', 'dots', 'waves', 'grid', 'checks']],
  gradient: [['black-white', 'silver', 'red-white', 'mint', 'blue-green', 'violet', 'sunset'], ['rainbow', 'ocean', 'fire', 'forest']],
  pattern: [['party', 'tiger', 'stone', 'confetti', 'weave', 'lava', 'dots']],
  mixer: [['invert', 'solarize', 'emboss', 'blur', 'sepia', 'posterize'], ['pixelate', 'mirror', 'swirl', 'grayscale', 'sharpen', 'noise']],
  eraser: [['fade', 'explode', 'swirl', 'wipe', 'shatter']],
};

const specs = {
  draw: [['pencil', 'Pencil'], ['chalk', 'Chalk'], ['crayon', 'Crayon'], ['marker', 'Marker']],
  paint: [['brush', 'Paint Brush'], ['sound', 'Sound Art Tool'], ['spray', 'Spray Can']],
  bucket: [['bucket', 'Single Color Paint Bucket'], ['gradient', 'Blend of Colors Paint Bucket'], ['pattern', 'Multicolor Pattern Paint Bucket']],
  mixer: [['mega', 'Mega Mixer'], ['wand', 'Mixer Wand']],
  grab: [['grab', 'Grab Hand'], ['scissors', 'Scissors']],
  eraser: [['round', 'Mini Eraser'], ['big', 'Big Eraser']],
};

const controlsFor = (choices, start, end, y, height) => {
  const width = (end - start) / choices.length;
  return choices.map(([value, label], index) => [value, label, start + index * width, y, width, height]);
};

export function trayState(state) {
  const group = state.tray;
  const tool = state.tools[group];
  let art = group;
  if (group === 'paint') {
    if (tool === 'sound') art = state.alt ? 'hands-free' : 'sound';
    else if (tool === 'spray') art = state.alt ? 'moving-spray' : 'spray';
    else if (state.alt) art = 'wacky';
  }
  if (group === 'bucket') art = tool;
  if (group === 'grab') art = tool;
  if (group === 'mixer' && tool === 'wand') art = 'mixer-wand';
  const controls = [];
  const add = (action, entries, selected) => {
    for (const [value, label, x, y, w, h] of entries) controls.push({
      action, value, label, x, y, w, h, selected: value === selected,
    });
  };
  if (specs[group]) add('tool', controlsFor(specs[group], 67, 513, 74, 200), tool);
  if (['draw', 'paint', 'mixer', 'stamp', 'eraser'].includes(group)) {
    add('size', sizes.map(([value, label], i) => [value, label, 637, 81 + i * 54, 63, 47]), state.sizes[group]);
  }
  if (group === 'draw') add('style', drawStyles, state.drawStyle);
  if (group === 'paint') {
    const modes = tool === 'spray' ? ['Paint Shapes', 'Moving Paints']
      : tool === 'sound' ? ['Mouse-move', 'Hands-free'] : ['Realistic Paint', 'Wacky Paint'];
    add('mode', modes.map((label, i) => [Boolean(i), label, 747, 77 + i * 92, 126, 77]), state.alt);
  }
  const rows = paintStyles[art];
  if (rows) {
    const page = state.page % rows.length;
    const styles = rows[page];
    const start = group === 'paint' || group === 'eraser' ? 887 : group === 'mixer' ? 758 : 628;
    add('effect', controlsFor(styles.map((style, i) => [i, style === 'solid' ? 'Solid Color' : style]), start, 1511, 101, 118), state.effect);
    add('page', [[-1, 'Previous row', 1517, 70, 92, 61], [1, 'Next row', 1517, 188, 92, 62]]);
  }
  if (group === 'eraser') add('eraser-shape', [['round', 'Round eraser', 753, 81, 60, 80], ['square', 'Square eraser', 813, 81, 60, 80]], state.eraserShape);
  if (group === 'grab') {
    add('edit', controlsFor([['cut', 'Cut'], ['copy', 'Copy'], ['paste', 'Paste']], 612, 793, 78, 152));
    if (tool === 'grab') add('edit', controlsFor([['front', 'Bring to Front'], ['forward', 'Bring Forward'], ['backward', 'Send Backward'], ['back', 'Send to Back']], 878, 1510, 77, 160));
    else add('style', controlsFor([['freehand', 'Free Cutout'], ['polygon', 'Polygon Cutout'], ['ellipse', 'Circle Cutout'], ['rectangle', 'Square Cutout']], 826, 1510, 75, 163), state.selectionStyle);
  }
  return { art, controls, effect: rows?.[state.page % rows.length]?.[state.effect] };
}

export function place(x, y, w, h) {
  return `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
}

const optionNames = {
  paint: ['Oil Paint', 'Air Brush', 'Dry Brush', 'Neon Tube', 'Flower Spray', 'Sand', 'Star Spray', 'Smudge with Shadow', 'Fat Star with Hilite', 'Square Tube', 'Soft Star Scatter', 'Oval Spatter', 'Cottage Cheese', 'Line of Dots', 'Shape Spatter', 'Row of Dots 2', 'Star Scatter', 'Gel Tube', 'Star Piles', 'Finger Paint'],
  wacky: ['Pyramid', 'Drippy Paint', 'Swirls', 'Fracture', 'Triangle Swirls', 'Green Hoops', 'Pixie Dust', 'Kooshie', 'Leaky Pen', 'Scratchy Pen', 'Spiral Pen', 'Zig Zag Pen', 'Bricks', 'Logs', 'Window', 'French Door', 'Wood Door', 'Roof', 'Dot to Dots', 'ABC Text', 'Rainbow', 'Color Tiles', 'Kaleidoscope', 'Splats', 'Fractal Trees'],
  mixer: ['Invert', 'Nuclear', 'Emboss', 'Lighten', 'Sepia', 'Colorize', 'Color Cycle', 'Greyscale', 'Pixellate', 'Posterize', 'Solarize', 'Pinch', 'Spherize', 'Weave', 'Bubble', 'Burlap', 'Spin', 'Shatter', 'Swirl', 'Noise', 'Flip', 'Rotate', 'Scale', 'Mosaic'],
  'mixer-wand': ['Smear', 'Smooth', 'Color Remover', 'Colorizer', 'Inverter', 'Embosser', 'Edge Detector', 'Nuclear', 'Solarizer', 'Color Shifter', 'Posterizer', 'Mosaic'],
  eraser: ['Firecracker', 'Clock Face', 'Iris Heart', 'Iris Star', 'Windmill', 'Page Tear', 'Spiral', 'Implode', 'Engulf', 'Fade', 'Explode', 'Kaleidoscope', 'Waterfall', 'Wipe Right', 'Vanish'],
  scissors: ['Free Cutout', 'Polygon Cutout', 'Circle Cutout', 'Square Cutout', 'Square Cutter', 'Rectangle Cutter', 'Circle Cutter', 'Ellipse Cutter', 'Heart Cutter', 'House Cutter', 'Pear Cutter', 'Car Cutter', 'Tree Cutter', 'Maple Leaf Cutter'],
};

const optionNouns = {
  bucket: 'Single Color Pattern', gradient: 'Color Blend', pattern: 'Multicolor Pattern',
  sound: 'Sound Art Effect', 'hands-free': 'Hands-free Effect', spray: 'Paint Shape', 'moving-spray': 'Moving Paint',
  wacky: 'Wacky Paint', eraser: 'Big Eraser Effect',
};

export function optionTitle(art, index) {
  if (art === 'bucket' && index === 0) return 'Solid Color';
  return optionNames[art]?.[index] || `${optionNouns[art] || 'Effect'} ${index + 1}`;
}
