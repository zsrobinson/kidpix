import { original, originalCssUrl } from './library.js';
import { place } from './trays.js';

const trayAsset = name => original(`ui/libraries/${name}`);

const tabLabels = {
  backgrounds: 'Color Backgrounds', projects: 'Line Drawings and Projects', maps: 'Maps',
  stickers: 'Object Stickers', flags: 'Flag Stickers', '3d': '3D Animations', '2d': '2D Animations',
  sounds: 'Sounds', movies: 'Movies',
};

const sections = {
  backgrounds: ['colorBackgroundsNames', 'blackAndWhiteOutlines', 'countries'],
  stickers: ['differentStickers', 'flagsStickers'],
  toons: ['3DToons', 'RegularToons'],
};

export function libraryCategories(groups, key, tab) {
  const categories = groups[key] ?? [];
  const section = sections[key]?.[
    { projects: 1, maps: 2, flags: 1, '2d': 1 }[tab] ?? 0
  ];
  return section && categories.some(category => category.section)
    ? categories.filter(category => category.section === section)
    : categories;
}

export function trayKey(key, tab) {
  if (key === 'backgrounds' && ['projects', 'maps'].includes(tab)) return `background-${tab}`;
  if (key === 'stickers' && tab === 'flags') return 'sticker-flags';
  if (key === 'toons' && tab === '2d') return 'toons-2d';
  return key === 'frames' ? 'movies' : key;
}

function action(label, value, rect, pressed) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hit';
  button.dataset.action = value;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.style.cssText = place(...rect);
  if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
  return button;
}

const commandFor = {
  backgrounds: {
    delete: ['Remove from My Backgrounds', 'delete-imported'],
    remove: ['Remove Background', 'remove-background'],
    import: ['Import Background', 'import-background'],
  },
  sounds: {
    delete: ['Remove from My Sounds', 'delete-imported'],
    remove: ['Remove Sound', 'remove-sound'],
    import: ['Import Sound', 'import-sound'],
    record: ['Record Sound', 'record-sound'],
  },
  movies: {
    delete: ['Remove from My Movies', 'delete-imported'],
    size: ['Enlarge to Fill Canvas', 'enlarge'],
    import: ['Import Movie', 'import-movie'],
    record: ['Video Narration', 'record-video'],
    frame: ['Movie Frames', 'library-tab:frames'],
  },
  frames: {
    frame: ['Back to Movies', 'library-tab:movies'],
    record: ['Video Narration', 'record-video'],
  },
  stamps: { 'edit-stamp': ['Stamp Editor', 'stamp-edit'] },
};

function readout(root, value, rect) {
  const output = document.createElement('output');
  output.className = 'original-library-name';
  output.style.cssText = place(...rect);
  output.textContent = value;
  root.append(output);
}

export function highlightLibraryItem(root, item) {
  for (const button of root.querySelectorAll('[data-asset]')) {
    button.setAttribute('aria-pressed', String(button.dataset.item === item?.id));
  }
  const label = root.querySelector('.original-library-name');
  if (label) label.textContent = item?.name || '';
}

export function showOriginalLibrary(root, manifest, tray, data) {
  const { categories, key, categoryIndex, page, pages, selected, stampSize, row, tab, status } = data;
  root.replaceChildren();
  root.classList.add('original-library');
  const artwork = document.createElement('img');
  artwork.className = 'original-library-art';
  artwork.alt = '';
  artwork.draggable = false;
  artwork.style.cssText = place(...manifest.rect);
  artwork.src = trayAsset(tray.image);
  root.append(artwork);

  for (const [name, rect] of Object.entries(tray.tabs)) {
    root.append(action(tabLabels[name], `library-tab:${name}`, rect, name === (tab || key)));
  }
  for (const [name, rect] of Object.entries(tray.controls)) {
    const command = commandFor[key]?.[name];
    if (command) root.append(action(...command, rect));
  }
  const [x, y, width] = tray.category;
  const select = document.createElement('select');
  select.id = 'category';
  select.setAttribute('aria-label', 'Library category');
  select.style.cssText = place(x + 6, y + (key === 'stamps' ? 13 : 12), width - 6, 30);
  categories.forEach((category, index) => select.add(new Option(category.localizedName || category.name, index, false, index === categoryIndex)));
  select.disabled = !categories.length;
  root.append(select);
  if (categoryIndex > 0) root.append(action('Previous category', 'category-step:-1', tray.previousCategory));
  if (categoryIndex + 1 < categories.length) root.append(action('Next category', 'category-step:1', tray.nextCategory));
  if (page > 0) root.append(action('Previous library row', 'lib-page:-1', tray.previousPage));
  if (page + 1 < pages) root.append(action('Next library row', 'lib-page:1', tray.nextPage));
  for (const [index, digit] of String(page + 1).padStart(2, '0').slice(-2).split('').entries()) {
    const image = document.createElement('img');
    image.alt = '';
    image.className = 'original-library-digit';
    image.src = trayAsset(`digit-${digit}.png`);
    image.style.cssText = place(...tray.pageDigits[index], 17, 24);
    root.append(image);
  }

  if (key === 'stamps') {
    for (const [index, size] of [4, 8, 16].entries()) {
      const control = action(['Small Stamp', 'Medium Stamp', 'Large Stamp'][index], `size:${size}`, [429, 649 + index * 23, 34, 23], stampSize === size);
      control.classList.add('stamp-size');
      root.append(control);
    }
  }
  for (const [index, item] of row.entries()) {
    const tile = action(item.name, '', tray.slots[index], item.id === selected?.id);
    delete tile.dataset.action;
    tile.classList.add('asset-tile', 'original-library-tile');
    tile.dataset.asset = index;
    tile.dataset.item = item.id;
    tile.draggable = Boolean(item.src);
    for (const [name, id] of [['normal', 738], ['hover', 739], ['selected', 740]]) {
      tile.style.setProperty(`--tile-${name}`, originalCssUrl(`ui/trays/icons/option-frame-${id}.png`));
    }
    if (item.thumbnail) {
      const image = document.createElement('img');
      image.src = item.thumbnail;
      image.alt = '';
      image.draggable = false;
      tile.append(image);
    }
    root.append(tile);
  }
  if (tray.selectedName) readout(root, selected?.name || '', tray.selectedName);
  if (!row.length) readout(root, status, [497, 665, 359, 46]);
}
