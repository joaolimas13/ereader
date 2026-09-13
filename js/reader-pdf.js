// Wrapper fino sobre pdf.js. Renderiza uma página por vez (lazy) para poupar
// memória no tablet — o documento inteiro nunca fica decodificado de uma vez.
window.PdfReader = (() => {
  let pdf = null;
  let canvas = null;
  let viewerEl = null;
  let currentPage = 1;
  let numPages = 1;
  let zoom = 1; // multiplicador sobre o "fit to width"
  let onRelocated = null;
  let renderTask = null;

  async function renderPage(pageNum) {
    if (!pdf) return;
    pageNum = Math.min(numPages, Math.max(1, pageNum));
    currentPage = pageNum;

    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    // clientWidth pode vir 0 se o container ainda não tiver layout (ex.: aba em
    // segundo plano, ou logo após entrar/sair do modo tela cheia) — nesse caso
    // cai para escala 1 em vez de gerar um canvas de tamanho zero.
    const containerWidth = viewerEl.clientWidth || baseViewport.width;
    const fitScale = containerWidth / baseViewport.width;
    const viewport = page.getViewport({ scale: fitScale * zoom * (window.devicePixelRatio || 1) });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = (viewport.width / (window.devicePixelRatio || 1)) + 'px';
    canvas.style.height = (viewport.height / (window.devicePixelRatio || 1)) + 'px';

    if (renderTask) {
      try { renderTask.cancel(); } catch (e) { /* já finalizado */ }
    }
    renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
    try {
      await renderTask.promise;
    } catch (e) {
      if (e && e.name !== 'RenderingCancelledException') throw e;
    }

    if (onRelocated) {
      onRelocated({ location: currentPage, percentage: numPages > 1 ? (currentPage - 1) / (numPages - 1) : 0 });
    }
  }

  async function open(viewerEl_, canvasEl, book, savedPage, settings, relocatedCb) {
    viewerEl = viewerEl_;
    canvas = canvasEl;
    onRelocated = relocatedCb;
    zoom = settings.zoom || 1;

    const arrayBuffer = await book.fileBlob.arrayBuffer();
    pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    numPages = pdf.numPages;

    await renderPage(savedPage || 1);
  }

  function next() { if (currentPage < numPages) renderPage(currentPage + 1); }
  function prev() { if (currentPage > 1) renderPage(currentPage - 1); }

  function goToFraction(fraction) {
    const page = Math.min(numPages, Math.max(1, Math.round(fraction * (numPages - 1)) + 1));
    renderPage(page);
  }

  function applySettings(settings) {
    zoom = settings.zoom || 1;
    renderPage(currentPage);
  }

  function resize() {
    if (pdf) renderPage(currentPage);
  }

  function destroy() {
    if (renderTask) { try { renderTask.cancel(); } catch (e) {} }
    if (pdf) pdf.destroy();
    pdf = null;
    canvas = null;
    viewerEl = null;
  }

  return { open, next, prev, goToFraction, applySettings, resize, destroy, get numPages() { return numPages; } };
})();
