(() => {
  const grid = document.getElementById('library-grid');
  const emptyState = document.getElementById('empty-state');
  const importBtn = document.getElementById('import-btn');
  const importInput = document.getElementById('import-input');
  const ctxSheet = document.getElementById('context-sheet');
  const ctxOpen = document.getElementById('ctx-open');
  const ctxRestart = document.getElementById('ctx-restart');
  const ctxRemove = document.getElementById('ctx-remove');
  const ctxCancel = document.getElementById('ctx-cancel');

  let contextBookId = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Falha ao carregar ' + src));
      document.body.appendChild(s);
    });
  }

  function detectFormat(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.epub') || file.type === 'application/epub+zip') return 'epub';
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
    return null;
  }

  async function extractEpubMeta(arrayBuffer) {
    await loadScript('vendor/jszip.min.js');
    await loadScript('vendor/epub.min.js');
    const book = ePub(arrayBuffer.slice(0));
    await book.opened;
    const metadata = await book.loaded.metadata;
    let coverBlob = null;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) {
        const resp = await fetch(coverUrl);
        coverBlob = await resp.blob();
        URL.revokeObjectURL(coverUrl);
      }
    } catch (e) { /* capa ausente ou não suportada, segue sem capa */ }
    book.destroy();
    return {
      title: metadata.title || null,
      author: metadata.creator || null,
      coverBlob,
    };
  }

  async function extractPdfMeta(arrayBuffer) {
    await loadScript('vendor/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    let title = null;
    try {
      const meta = await pdf.getMetadata();
      title = (meta.info && meta.info.Title) || null;
    } catch (e) { /* metadata ausente */ }

    let coverBlob = null;
    try {
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = 300;
      const scale = targetWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      coverBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    } catch (e) { /* renderização da capa falhou, segue sem capa */ }

    const pageCount = pdf.numPages;
    await pdf.destroy();
    return { title, coverBlob, pageCount };
  }

  async function importFile(file) {
    const format = detectFormat(file);
    if (!format) {
      alert(`Formato não suportado: ${file.name}`);
      return;
    }
    const arrayBuffer = await file.arrayBuffer();
    const fileBlob = new Blob([arrayBuffer], { type: file.type || (format === 'epub' ? 'application/epub+zip' : 'application/pdf') });

    let meta = {};
    try {
      meta = format === 'epub' ? await extractEpubMeta(arrayBuffer) : await extractPdfMeta(arrayBuffer);
    } catch (e) {
      console.error('Falha ao extrair metadados de', file.name, e);
    }

    const book = {
      id: uuid(),
      title: (meta.title && meta.title.trim()) || file.name.replace(/\.(epub|pdf)$/i, ''),
      author: meta.author || null,
      format,
      coverBlob: meta.coverBlob || null,
      fileBlob,
      pageCount: meta.pageCount || null,
      addedAt: Date.now(),
      size: file.size,
    };
    await DB.addBook(book);
  }

  importBtn.addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', async () => {
    const files = Array.from(importInput.files || []);
    importInput.value = '';
    if (!files.length) return;
    importBtn.disabled = true;
    importBtn.textContent = 'Importando…';
    for (const file of files) {
      try {
        await importFile(file);
      } catch (e) {
        console.error(e);
        alert(`Erro ao importar ${file.name}: ${e.message}`);
      }
    }
    importBtn.disabled = false;
    importBtn.textContent = '+ Adicionar';
    await renderLibrary();
  });

  function formatBadge(format) {
    return format === 'epub' ? 'EPUB' : 'PDF';
  }

  async function renderLibrary() {
    const books = await DB.getAllBooks();
    books.sort((a, b) => b.addedAt - a.addedAt);

    grid.innerHTML = '';
    emptyState.classList.toggle('hidden', books.length > 0);

    for (const book of books) {
      const progress = await DB.getProgress(book.id);
      const pct = progress && typeof progress.percentage === 'number' ? Math.round(progress.percentage * 100) : 0;

      const card = document.createElement('button');
      card.className = 'book-card';
      card.dataset.id = book.id;

      const cover = document.createElement('div');
      cover.className = 'book-cover';
      if (book.coverBlob) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(book.coverBlob);
        img.loading = 'lazy';
        cover.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.className = 'placeholder';
        ph.textContent = book.title;
        cover.appendChild(ph);
      }
      const badge = document.createElement('span');
      badge.className = 'fmt-badge';
      badge.textContent = formatBadge(book.format);
      cover.appendChild(badge);

      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      const progressFill = document.createElement('div');
      progressFill.style.width = pct + '%';
      progressBar.appendChild(progressFill);

      const title = document.createElement('div');
      title.className = 'book-title';
      title.textContent = book.title;

      card.appendChild(cover);
      card.appendChild(progressBar);
      card.appendChild(title);

      card.addEventListener('click', () => {
        window.location.href = `reader.html?id=${encodeURIComponent(book.id)}`;
      });

      let pressTimer = null;
      card.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => openContext(book.id), 500);
      }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach((evt) => {
        card.addEventListener(evt, () => clearTimeout(pressTimer));
      });
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openContext(book.id);
      });

      grid.appendChild(card);
    }
  }

  function openContext(bookId) {
    contextBookId = bookId;
    ctxSheet.classList.remove('hidden');
  }

  function closeContext() {
    contextBookId = null;
    ctxSheet.classList.add('hidden');
  }

  ctxCancel.addEventListener('click', closeContext);
  ctxSheet.addEventListener('click', (e) => {
    if (e.target === ctxSheet) closeContext();
  });

  ctxOpen.addEventListener('click', () => {
    if (contextBookId) window.location.href = `reader.html?id=${encodeURIComponent(contextBookId)}`;
  });

  ctxRestart.addEventListener('click', async () => {
    if (!contextBookId) return;
    await DB.saveProgress(contextBookId, { location: null, percentage: 0 });
    closeContext();
    await renderLibrary();
  });

  ctxRemove.addEventListener('click', async () => {
    if (!contextBookId) return;
    if (confirm('Remover este livro da biblioteca? O arquivo importado será apagado do dispositivo.')) {
      await DB.deleteBook(contextBookId);
      closeContext();
      await renderLibrary();
    } else {
      closeContext();
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW falhou', e));
    });
  }

  renderLibrary();
})();
