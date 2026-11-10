// Browser preference only: never part of a picture or its history.
export const PENCIL_PREVIEW_KEY = 'kidpix.pencil-preview';

export function createPencilPreviewPreference(storage = () => globalThis.localStorage) {
  let enabled = false;
  try { enabled = storage().getItem(PENCIL_PREVIEW_KEY) === 'true'; } catch { /* unavailable storage */ }
  return {
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      try { storage().setItem(PENCIL_PREVIEW_KEY, String(enabled)); } catch { /* keep this session's explicit choice */ }
      return enabled;
    },
  };
}
