// The About window: name, version, a few lines on what the app is, and a link
// to its source. Everything shown comes from the main process.
window.fengshui.about().then((a) => {
  document.title = `About ${a.name}`;
  document.getElementById('name').textContent = a.name;
  document.getElementById('ver').textContent = `Version ${a.version}`;
  document.getElementById('tagline').textContent = `${a.tagline}. Small, quiet things to look at: a clock, the weather, the films you mean to watch, notes on a corkboard.`;
  document.getElementById('foot').textContent = `Made by ${a.author} · ${a.license} licence · Electron ${a.electron}`;
  document.getElementById('repo').addEventListener('click', () => window.fengshui.openRepo());
  document.getElementById('close').addEventListener('click', () => window.close());
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.metaKey && e.key === 'w')) window.close(); });
