'use strict';

const { globalShortcut } = require('electron');

/**
 * Register the app-wide global shortcuts from the store's settings.
 * Returns a map of shortcut key -> registered (bool).
 */
function registerShortcuts(store, actions) {
  globalShortcut.unregisterAll();
  const map = store.getSettings().shortcuts || {};
  const entries = [
    ['toggle', map.toggle, actions.toggleWidget],
    ['newObservation', map.newObservation, () => actions.newNote('observe')],
    ['newLine', map.newLine, () => actions.newNote('line')]
  ];
  const result = {};
  for (const [key, accel, fn] of entries) {
    if (!accel || typeof fn !== 'function') {
      result[key] = false;
      continue;
    }
    try {
      result[key] = globalShortcut.register(accel, fn);
    } catch (_) {
      result[key] = false;
    }
  }
  return result;
}

/** True if an accelerator string can be registered (used by the settings UI). */
function validate(accel) {
  if (!accel || typeof accel !== 'string') return false;
  try {
    const ok = globalShortcut.register(accel, () => {});
    if (ok) globalShortcut.unregister(accel);
    return ok;
  } catch (_) {
    return false;
  }
}

module.exports = { registerShortcuts, validate };
