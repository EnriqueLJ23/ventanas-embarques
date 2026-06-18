type SaveFn = () => void;
let _fn: SaveFn | null = null;

export const autoSaveRegistry = {
  register(fn: SaveFn) { _fn = fn; },
  unregister() { _fn = null; },
  trigger() { _fn?.(); },
};
