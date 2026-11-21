'use strict';

// Optional AppKit bridge (native/fengshui_native.mm). Feng Shui works without it,
// with two differences: the native blur keeps Electron's fixed corner radius,
// and "On the desktop layer" falls back to a display-only window type.
let native = null;
let loadError = null;
try {
  native = require('../../native/build/Release/fengshui_native.node');
} catch (err) {
  loadError = err.message;
}

module.exports = {
  available: !!native,
  loadError,
  setCornerRadius(win, radius) {
    if (!native || win.isDestroyed()) return false;
    return native.setCornerRadius(win.getNativeWindowHandle(), radius);
  },
  appIcon(appPath, size) {
    if (!native || !native.appIcon) return null;
    return native.appIcon(appPath, size);
  },
  // null when unknown (no helper), otherwise whether the left button is held.
  mouseDown() {
    return native && native.mouseDown ? native.mouseDown() : null;
  },
  setDesktopLevel(win, on) {
    if (!native || win.isDestroyed()) return false;
    return native.setDesktopLevel(win.getNativeWindowHandle(), on);
  },
};
