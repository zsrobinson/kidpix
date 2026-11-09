import { access } from 'node:fs/promises';

try {
  for (const path of ['catalog.json', 'ui/ui.json', 'ui/trays.json', 'ui/library-trays.json']) {
    await access(new URL(`../../public/original/${path}`, import.meta.url));
  }
} catch {
  console.error('Browser parity tests need the local trial assets. Run npm run import:original first; see README.md.');
  process.exitCode = 1;
}
