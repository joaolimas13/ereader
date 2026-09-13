// Wrapper fino sobre epub.js, expõe uma interface comum usada por reader.js
window.EpubReader = (() => {
  let book = null;
  let rendition = null;
  let onRelocated = null;
  let spineLength = 1;

  const THEMES = {
    light: { body: { background: '#f5f2ea', color: '#1a1a1a' } },
    dark: { body: { background: '#1a1a1a', color: '#e8e3d8' } },
    sepia: { body: { background: '#e8d9b5', color: '#3a2f1e' } },
  };

  function registerThemes(spacing) {
    Object.keys(THEMES).forEach((name) => {
      rendition.themes.register(name, {
        ...THEMES[name],
        'p, div, li': { 'line-height': `${spacing} !important` },
      });
    });
  }

  async function open(containerEl, book_, savedLocation, settings, relocatedCb) {
    onRelocated = relocatedCb;
    const arrayBuffer = await book_.fileBlob.arrayBuffer();
    book = ePub(arrayBuffer);
    await book.ready;
    spineLength = book.spine.length || 1;

    rendition = book.renderTo(containerEl, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
    });

    registerThemes(settings.spacing || 1.4);
    rendition.themes.select(settings.theme || 'light');
    rendition.themes.fontSize((settings.fontSize || 100) + '%');
    if (settings.fontFamily) rendition.themes.font(settings.fontFamily);

    rendition.on('relocated', (location) => {
      const idx = location.start.index || 0;
      const percentage = spineLength > 1 ? idx / (spineLength - 1) : 0;
      if (onRelocated) onRelocated({ location: location.start.cfi, percentage });
    });

    await rendition.display(savedLocation || undefined);
  }

  function next() { if (rendition) rendition.next(); }
  function prev() { if (rendition) rendition.prev(); }

  function goToFraction(fraction) {
    if (!book) return;
    const idx = Math.min(spineLength - 1, Math.max(0, Math.round(fraction * (spineLength - 1))));
    const item = book.spine.get(idx);
    if (item) rendition.display(item.href);
  }

  function applySettings(settings) {
    if (!rendition) return;
    registerThemes(settings.spacing || 1.4);
    rendition.themes.select(settings.theme || 'light');
    rendition.themes.fontSize((settings.fontSize || 100) + '%');
    if (settings.fontFamily) rendition.themes.font(settings.fontFamily);
  }

  function resize() {
    if (rendition) { try { rendition.resize(); } catch (e) { /* epub.js já reage a resize sozinho na maioria dos casos */ } }
  }

  function destroy() {
    if (book) book.destroy();
    book = null;
    rendition = null;
  }

  return { open, next, prev, goToFraction, applySettings, resize, destroy };
})();
