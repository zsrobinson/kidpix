// Native capture recipes. Coordinates are in the 1024×768 application frame;
// drawing coordinates are relative to the 720×542 page at (164, 67).
export const scenarios = [
  { id: 'paint-empty', title: 'Empty Paint Zone', steps: 'Start a new picture named KidPix1. Select Drawing Tools, Pencil, Medium, Freestyle Line, black. Move the pointer outside the application.' },
  { id: 'pencil-line', title: 'Pencil straight line', steps: 'From paint-empty, select Straight Line. Drag from page (120, 120) to (420, 300). Release and move the pointer outside the application.' },
  { id: 'filled-box', title: 'Filled box', steps: 'From paint-empty, select Filled Box. Drag from page (120, 120) to (420, 300). Release and move the pointer outside the application.' },
  { id: 'paint-tray', title: 'Painting tray', steps: 'From paint-empty, click Painting Tools. Keep the default Paint Brush, Medium, Realistic Paint and first effect. Move the pointer outside the application.' },
  { id: 'paint-airbrush-large', title: 'Large Air Brush selected', steps: 'From paint-empty, click Painting Tools. Select Large and Air Brush (second effect in the first row), keeping Realistic Paint. Move the pointer outside the application.' },
  { id: 'backgrounds-tray', title: 'Background library', steps: 'From paint-empty, click Backgrounds. Keep the first category and first row; select no item. Move the pointer outside the application.' },
  { id: 'sticker-placed', title: 'Sticker placement', steps: 'From paint-empty, click Stickers. Double-click the first item of the first category/row to place it at the default position. Move the pointer outside the application.' },
  { id: 'slide-show', title: 'Slide Show with one picture', steps: 'From paint-empty, click Add Picture to Slide Show, then Go to Slide Show. Wait for the status notice to disappear. Keep the default title My Slide Show and move the pointer outside the application.' },
];
