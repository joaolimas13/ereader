(() => {
  const params = new URLSearchParams(location.search);
  const bookId = params.get('id');

  const titleEl = document.getElementById('reader-title');
  const backBtn = document.getElementById('back-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsClose = document.getElementById('settings-close');
  const epubViewer = document.getElementById('epub-viewer');
  const pdfViewer = document.getElementById('pdf-viewer');
  const pdfCanvas = document.getElementById('pdf-canvas');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const zonePrev = document.getElementById('zone-prev');
  const zoneNext = document.getElementById('zone-next');
  const zoneToggle = document.getElementById('zone-toggle');
  const slider = document.getElementById('progress-slider');
  const locLabel = document.getElementById('loc-label');
  const toolbar = document.querySelector('.reader-toolbar');
  const footer = document.querySelector('.reader-footer');

  const epubSettingsBlock = document.getElementById('epub-settings');
  const pdfSettingsBlock = document.getElementById('pdf-settings');
  const fontSizeLabel = document.getElementById('font-size-label');
  const spacingLabel = document.getElementById('spacing-label');
  const zoomLabel = document.getElementById('zoom-label');

  const DEFAULT_SETTINGS = { theme: 'light', fontSize: 100, spacing: 1.4, fontFamily: 'serif', zoom: 1 };

  let book = null;
  let settings = { ...DEFAULT_SETTINGS };
  let reader = null;
  let saveTimer = null;
  let sliderIsDragging = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Falha ao carregar ' + src));
      document.body.appendChild(s);
    });
  }

  function applyBodyTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-sepia');
    if (theme === 'dark') document.body.classList.add('theme-dark');
    if (theme === 'sepia') document.body.classList.add('theme-sepia');
  }

  function updateSettingsUI() {
    document.querySelectorAll('.theme-swatch').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === settings.theme);
    });
    document.querySelectorAll('.font-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.font === settings.fontFamily);
    });
    fontSizeLabel.textContent = settings.fontSize + '%';
    spacingLabel.textContent = settings.spacing.toFixed(1);
    zoomLabel.textContent = Math.round(settings.zoom * 100) + '%';
  }

  async function persistSettings() {
    await DB.setSetting('readerSettings', settings);
  }

  function onRelocated({ location, percentage }) {
    if (!sliderIsDragging) {
      slider.value = String(Math.round((percentage || 0) * 1000));
    }
    if (book.format === 'pdf') {
      locLabel.textContent = `${location} / ${reader.numPages}`;
    } else {
      locLabel.textContent = Math.round((percentage || 0) * 100) + '%';
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      DB.saveProgress(bookId, { location, percentage });
    }, 500);
  }

  async function init() {
    if (!bookId) { location.href = 'index.html'; return; }
    book = await DB.getBook(bookId);
    if (!book) { location.href = 'index.html'; return; }

    titleEl.textContent = book.title;
    document.title = book.title;

    const savedSettings = await DB.getSetting('readerSettings', null);
    if (savedSettings) settings = { ...DEFAULT_SETTINGS, ...savedSettings };
    applyBodyTheme(settings.theme);

    const progress = await DB.getProgress(bookId);

    epubSettingsBlock.classList.toggle('hidden', book.format !== 'epub');
    pdfSettingsBlock.classList.toggle('hidden', book.format !== 'pdf');
    updateSettingsUI();

    if (book.format === 'epub') {
      epubViewer.classList.remove('hidden');
      await loadScript('vendor/jszip.min.js');
      await loadScript('vendor/epub.min.js');
      await loadScript('js/reader-epub.js');
      reader = window.EpubReader;
      await reader.open(epubViewer, book, progress && progress.location, settings, onRelocated);
    } else {
      pdfViewer.classList.remove('hidden');
      await loadScript('vendor/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      await loadScript('js/reader-pdf.js');
      reader = window.PdfReader;
      await reader.open(pdfViewer, pdfCanvas, book, progress && progress.location, settings, onRelocated);
    }
  }

  backBtn.addEventListener('click', () => { location.href = 'index.html'; });

  prevBtn.addEventListener('click', () => reader && reader.prev());
  nextBtn.addEventListener('click', () => reader && reader.next());
  zonePrev.addEventListener('click', () => reader && reader.prev());
  zoneNext.addEventListener('click', () => reader && reader.next());
  zoneToggle.addEventListener('click', () => {
    toolbar.classList.toggle('hidden');
    footer.classList.toggle('hidden');
  });

  slider.addEventListener('pointerdown', () => { sliderIsDragging = true; });
  slider.addEventListener('pointerup', () => { sliderIsDragging = false; });
  slider.addEventListener('change', () => {
    if (reader) reader.goToFraction(Number(slider.value) / 1000);
  });

  settingsBtn.addEventListener('click', () => settingsPanel.classList.remove('hidden'));
  settingsClose.addEventListener('click', () => settingsPanel.classList.add('hidden'));
  settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) settingsPanel.classList.add('hidden');
  });

  document.querySelectorAll('.theme-swatch').forEach((btn) => {
    btn.addEventListener('click', async () => {
      settings.theme = btn.dataset.theme;
      applyBodyTheme(settings.theme);
      updateSettingsUI();
      if (reader) reader.applySettings(settings);
      await persistSettings();
    });
  });

  document.querySelectorAll('.font-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
      settings.fontFamily = btn.dataset.font;
      updateSettingsUI();
      if (reader) reader.applySettings(settings);
      await persistSettings();
    });
  });

  document.getElementById('font-inc').addEventListener('click', async () => {
    settings.fontSize = Math.min(220, settings.fontSize + 10);
    updateSettingsUI();
    if (reader) reader.applySettings(settings);
    await persistSettings();
  });
  document.getElementById('font-dec').addEventListener('click', async () => {
    settings.fontSize = Math.max(60, settings.fontSize - 10);
    updateSettingsUI();
    if (reader) reader.applySettings(settings);
    await persistSettings();
  });

  document.getElementById('spacing-inc').addEventListener('click', async () => {
    settings.spacing = Math.min(2.4, Math.round((settings.spacing + 0.1) * 10) / 10);
    updateSettingsUI();
    if (reader) reader.applySettings(settings);
    await persistSettings();
  });
  document.getElementById('spacing-dec').addEventListener('click', async () => {
    settings.spacing = Math.max(1.0, Math.round((settings.spacing - 0.1) * 10) / 10);
    updateSettingsUI();
    if (reader) reader.applySettings(settings);
    await persistSettings();
  });

  document.getElementById('zoom-inc').addEventListener('click', async () => {
    settings.zoom = Math.min(3, Math.round((settings.zoom + 0.1) * 10) / 10);
    updateSettingsUI();
    if (reader) reader.applySettings(settings);
    await persistSettings();
  });
  document.getElementById('zoom-dec').addEventListener('click', async () => {
    settings.zoom = Math.max(0.5, Math.round((settings.zoom - 0.1) * 10) / 10);
    updateSettingsUI();
    if (reader) reader.applySettings(settings);
    await persistSettings();
  });

  window.addEventListener('beforeunload', () => {
    if (reader) reader.destroy();
  });

  init();
})();
