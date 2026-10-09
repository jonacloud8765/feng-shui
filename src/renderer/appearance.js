// Turns an appearance object into CSS custom properties on an element.
// Shared by widget windows and the live preview in the settings window.

export function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function applyAppearance(el, ap, fonts) {
  const s = el.style;
  const font = (key, fallback) => (fonts[key] || fonts[fallback]).stack;
  s.setProperty('--text', ap.text);
  s.setProperty('--accent', ap.accent);
  s.setProperty('--tint', hexToRgba(ap.tint, ap.tintOpacity));
  s.setProperty('--radius', `${ap.radius}px`);
  s.setProperty('--pad', `${ap.padding}px`);
  s.setProperty('--scale', String(ap.scale));
  s.setProperty('--display', font(ap.font, 'didot'));
  s.setProperty('--info', font(ap.infoFont, 'sf'));
  s.setProperty('--weight', String(ap.weight));
  s.setProperty('--align', ap.align);
  s.setProperty('--justify', { left: 'flex-start', center: 'center', right: 'flex-end' }[ap.align] || 'center');
  s.setProperty('--highlight', String(ap.highlight));
  s.setProperty('--image-opacity', String(ap.imageOpacity));
  el.classList.toggle('no-labels', !ap.labels);
  // Light tints get dark controls, so the glass stays legible either way.
  el.style.colorScheme = isLight(ap.text) ? 'dark' : 'light';
}

export function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140;
}

export function fileUrl(p) {
  return 'file://' + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
}
