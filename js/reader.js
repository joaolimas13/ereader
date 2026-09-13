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
  const readerViewport = document.querySelector('.reader-viewport');

  const epubSettingsBlock = document.getElementById('epub-settings');
  const pdfSettingsBlock = document.getElementById('pdf-settings');
  const fontSizeLabel = document.getElementById('font-size-label');
  const spacingLabel = document.getElementById('spacing-label');
  const zoomLabel = document.getElementById('zoom-label');
  const timeColorToggle = document.getElementById('time-color-toggle');
  const focusWorkLabel = document.getElementById('focus-work-label');
  const focusBreakLabel = document.getElementById('focus-break-label');

  const focusBtn = document.getElementById('focus-btn');
  const focusWidget = document.getElementById('focus-widget');
  const focusTimeLabel = document.getElementById('focus-time-label');
  const focusPhaseLabel = document.getElementById('focus-phase-label');
  const focusToggleRun = document.getElementById('focus-toggle-run');
  const focusExitBtn = document.getElementById('focus-exit');
  const breakOverlay = document.getElementById('break-overlay');
  const breakTimeLabel = document.getElementById('break-time-label');
  const breakSkipBtn = document.getElementById('break-skip');

  const DEFAULT_SETTINGS = {
    theme: 'light', fontSize: 100, spacing: 1.4, fontFamily: 'serif', zoom: 1,
    autoColorByTime: false, focusWorkMin: 25, focusBreakMin: 5,
  };

  let book = null;
  let settings = { ...DEFAULT_SETTINGS };
  let reader = null;
  let saveTimer = null;
  let sliderIsDragging = false;
  let timeColorInterval = null;

  let focusActive = false;
  let focusTimerId = null;
  let focusPhase = 'work';
  let focusRemaining = 0;
  let focusRunning = false;

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
    timeColorToggle.textContent = settings.autoColorByTime ? 'Ativado' : 'Desativado';
    timeColorToggle.classList.toggle('active', settings.autoColorByTime);
    focusWorkLabel.textContent = settings.focusWorkMin;
    focusBreakLabel.textContent = settings.focusBreakMin;
  }

  async function persistSettings() {
    await DB.setSetting('readerSettings', settings);
  }

  // ---------- Ajuste de cor por horário ----------
  // "Night light" simples: quanto mais perto da noite, mais quente/dessaturada
  // fica a tela. Aplicado como filter CSS no viewport (afeta iframe do EPUB e
  // canvas do PDF igual, sem precisar mexer em cada renderer).
  function timeWarmthFactor() {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    if (h >= 6 && h < 17) return 0;
    if (h >= 17 && h < 20) return (h - 17) / 3;
    return 1;
  }

  function applyTimeColor() {
    if (!settings.autoColorByTime) {
      readerViewport.style.filter = '';
      return;
    }
    const factor = timeWarmthFactor();
    readerViewport.style.filter = factor <= 0
      ? ''
      : `sepia(${(0.35 * factor).toFixed(2)}) saturate(${(1 - 0.15 * factor).toFixed(2)}) brightness(${(1 - 0.06 * factor).toFixed(2)})`;
  }

  // ---------- Modo foco (Pomodoro) ----------
  function formatMMSS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function updateFocusUI() {
    focusTimeLabel.textContent = formatMMSS(focusRemaining);
    focusPhaseLabel.textContent = focusPhase === 'work' ? 'foco' : 'pausa';
    focusToggleRun.textContent = focusRunning ? '⏸' : '▶';
    if (focusPhase === 'break') breakTimeLabel.textContent = formatMMSS(focusRemaining);
  }

  function focusTick() {
    focusRemaining -= 1;
    if (focusRemaining <= 0) {
      if (focusPhase === 'work') {
        focusPhase = 'break';
        focusRemaining = settings.focusBreakMin * 60;
        breakOverlay.classList.remove('hidden');
      } else {
        focusPhase = 'work';
        focusRemaining = settings.focusWorkMin * 60;
        breakOverlay.classList.add('hidden');
      }
    }
    updateFocusUI();
  }

  function startFocusTimer() {
    focusPhase = 'work';
    focusRemaining = settings.focusWorkMin * 60;
    focusRunning = true;
    updateFocusUI();
    clearInterval(focusTimerId);
    focusTimerId = setInterval(focusTick, 1000);
  }

  async function enterFocusMode() {
    focusActive = true;
    focusWidget.classList.remove('hidden');
    toolbar.classList.add('hidden');
    footer.classList.add('hidden');
    try { await document.documentElement.requestFullscreen(); } catch (e) { /* sem suporte, segue sem fullscreen */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('portrait'); } catch (e) { /* trava indisponível fora de PWA instalado */ }
    startFocusTimer();
  }

  function exitFocusMode() {
    if (!focusActive) return;
    focusActive = false;
    clearInterval(focusTimerId);
    focusTimerId = null;
    focusRunning = false;
    focusWidget.classList.add('hidden');
    breakOverlay.classList.add('hidden');
    toolbar.classList.remove('hidden');
    footer.classList.remove('hidden');
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* nada a fazer */ }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
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
    applyTimeColor();
    clearInterval(timeColorInterval);
    timeColorInterval = setInterval(applyTimeColor, 60000);

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

  timeColorToggle.addEventListener('click', async () => {
    settings.autoColorByTime = !settings.autoColorByTime;
    updateSettingsUI();
    applyTimeColor();
    await persistSettings();
  });

  document.getElementById('focus-work-inc').addEventListener('click', async () => {
    settings.focusWorkMin = Math.min(90, settings.focusWorkMin + 5);
    updateSettingsUI();
    await persistSettings();
  });
  document.getElementById('focus-work-dec').addEventListener('click', async () => {
    settings.focusWorkMin = Math.max(5, settings.focusWorkMin - 5);
    updateSettingsUI();
    await persistSettings();
  });
  document.getElementById('focus-break-inc').addEventListener('click', async () => {
    settings.focusBreakMin = Math.min(30, settings.focusBreakMin + 1);
    updateSettingsUI();
    await persistSettings();
  });
  document.getElementById('focus-break-dec').addEventListener('click', async () => {
    settings.focusBreakMin = Math.max(1, settings.focusBreakMin - 1);
    updateSettingsUI();
    await persistSettings();
  });

  focusBtn.addEventListener('click', () => enterFocusMode());
  focusExitBtn.addEventListener('click', () => exitFocusMode());
  focusToggleRun.addEventListener('click', () => {
    if (focusRunning) {
      clearInterval(focusTimerId);
      focusRunning = false;
    } else {
      focusTimerId = setInterval(focusTick, 1000);
      focusRunning = true;
    }
    updateFocusUI();
  });
  breakSkipBtn.addEventListener('click', () => {
    focusPhase = 'work';
    focusRemaining = settings.focusWorkMin * 60;
    breakOverlay.classList.add('hidden');
    updateFocusUI();
  });
  document.addEventListener('fullscreenchange', () => {
    if (focusActive && !document.fullscreenElement) exitFocusMode();
  });

  let resizeTimer = null;
  function onViewportResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (reader) reader.resize(); }, 200);
  }
  window.addEventListener('resize', onViewportResize);
  window.addEventListener('orientationchange', onViewportResize);

  window.addEventListener('beforeunload', () => {
    if (reader) reader.destroy();
  });

  init();
})();
