import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Download, ExternalLink, ChevronLeft, ChevronRight, 
  ZoomIn, ZoomOut, RotateCw, FileText, 
  Loader2, AlertCircle, Printer, Layers, ScrollText, Monitor
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Isolated Single Page Renderer with proper RenderTask lifecycle and cancellation
 */
function PdfPageItem({ pageNumber, pdfDoc, scale, rotation, numPages }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [rendering, setRendering] = useState(true);
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let isCancelled = false;

    async function drawPage() {
      if (!pdfDoc || !canvasRef.current) return;

      try {
        setRendering(true);

        // Cancel any pending render task on this canvas before starting a new one
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch (_) {}
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNumber);
        if (isCancelled) return;

        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const viewport = page.getViewport({ scale: scale * ratio, rotation });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const displayWidth = Math.round(viewport.width / ratio);
        const displayHeight = Math.round(viewport.height / ratio);
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        setPageDimensions({ width: displayWidth, height: displayHeight });

        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;

        await task.promise;
        if (!isCancelled) {
          setRendering(false);
        }
      } catch (err) {
        // PDF.js throws RenderingCancelledException when zooming or rotating quickly
        if (err?.name !== 'RenderingCancelledException' && !isCancelled) {
          console.warn(`[PDF Page ${pageNumber} Render Notice]:`, err.message);
          setRendering(false);
        }
      }
    }

    drawPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [pageNumber, pdfDoc, scale, rotation]);

  return (
    <div 
      className="relative bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-700/60 my-2 select-none group flex flex-col items-center justify-center transition-all"
      style={{
        minWidth: pageDimensions.width ? `${pageDimensions.width}px` : '320px',
        minHeight: pageDimensions.height ? `${pageDimensions.height}px` : '420px'
      }}
    >
      {rendering && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex flex-col items-center justify-center text-white z-10 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <span className="text-xs font-mono text-slate-200">Rendering Page {pageNumber}...</span>
        </div>
      )}
      <canvas ref={canvasRef} className="block max-w-full" />
      <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-md bg-black/75 text-white text-[11px] font-mono shadow-md pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity">
        Page {pageNumber} of {numPages}
      </div>
    </div>
  );
}

export default function PdfViewerModal({ url, title, onClose, onDownload }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [blobUrl, setBlobUrl] = useState('');
  // viewMode: 'single' (Default high-fidelity), 'continuous' (Scroll all), 'native' (Vector iframe)
  const [viewMode, setViewMode] = useState('single');

  const containerRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (!url) return;

    setLoading(true);
    setError(null);
    setCurrentPage(1);

    async function loadPdf() {
      try {
        const fetchUrl = url.includes('?') ? `${url}&download=0` : url;
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const blob = await response.blob();
        if (!active) return;

        // Force application/pdf blob type so native iframe and canvas render smoothly
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const objUrl = URL.createObjectURL(pdfBlob);
        setBlobUrl(objUrl);

        const buf = await pdfBlob.arrayBuffer();
        if (!active) return;

        const task = pdfjsLib.getDocument({
          data: new Uint8Array(buf),
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
          cMapPacked: true
        });
        const doc = await task.promise;
        if (!active) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (active) {
          console.error('[PDF Load Error]:', err);
          setError(err.message || 'Failed to render PDF');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { active = false; };
  }, [url]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight' && viewMode === 'single') setCurrentPage(p => Math.min(p + 1, numPages));
      else if (e.key === 'ArrowLeft' && viewMode === 'single') setCurrentPage(p => Math.max(p - 1, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages, onClose, viewMode]);

  // Direct In-App File Download
  const handleDownload = () => {
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = title || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (onDownload) {
      onDownload(url, title || 'document.pdf');
    }
  };

  const handlePrint = () => {
    if (!blobUrl) return;
    const w = window.open(blobUrl, '_blank');
    if (w) {
      w.focus();
      setTimeout(() => w.print(), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div 
        className="relative w-full max-w-6xl h-[94vh] bg-slate-900 rounded-2xl flex flex-col overflow-hidden shadow-2xl border border-slate-700/60"
        onClick={e => e.stopPropagation()}
      >
        {/* Top App Header Toolbar */}
        <div className="px-3 sm:px-4 py-2.5 bg-slate-800/95 border-b border-slate-700/80 flex items-center justify-between text-white shrink-0 gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-sm truncate text-white max-w-[160px] sm:max-w-md" title={title}>
                {title || 'Document.pdf'}
              </h4>
              <p className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>In-App PDF Viewer</span>
                {numPages > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono text-[10px]">
                    {numPages} {numPages === 1 ? 'Page' : 'Pages'}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Action & Zoom Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Page navigation (in single page mode) */}
            {numPages > 1 && viewMode === 'single' && (
              <div className="flex items-center bg-slate-700/80 rounded-lg p-0.5 mr-1">
                <button 
                  type="button" 
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} 
                  disabled={currentPage <= 1} 
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-600 transition-colors cursor-pointer"
                  title="Previous Page (Left Arrow)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 text-xs font-mono text-slate-200 select-none">
                  {currentPage} / {numPages}
                </span>
                <button 
                  type="button" 
                  onClick={() => setCurrentPage(p => Math.min(p + 1, numPages))} 
                  disabled={currentPage >= numPages} 
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-600 transition-colors cursor-pointer"
                  title="Next Page (Right Arrow)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Zoom Controls */}
            {viewMode !== 'native' && (
              <div className="hidden sm:flex items-center bg-slate-700/80 rounded-lg p-0.5">
                <button 
                  type="button" 
                  onClick={() => setScale(s => Math.max(s - 0.2, 0.6))} 
                  className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-600 transition-colors cursor-pointer" 
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button 
                  type="button" 
                  onClick={() => setScale(1.0)} 
                  className="px-1.5 py-0.5 text-xs font-mono text-slate-200 rounded hover:bg-slate-600 transition-colors cursor-pointer"
                  title="Reset Zoom"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button 
                  type="button" 
                  onClick={() => setScale(s => Math.min(s + 0.2, 3.0))} 
                  className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-600 transition-colors cursor-pointer" 
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Rotate Button */}
            {viewMode !== 'native' && (
              <button 
                type="button" 
                onClick={() => setRotation(r => (r + 90) % 360)} 
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg hidden sm:block transition-colors cursor-pointer" 
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            )}

            {/* View Mode Toggle: Single Page vs All Pages vs Native Viewer */}
            <div className="flex items-center bg-slate-700/80 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('single')}
                className={`p-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1 ${
                  viewMode === 'single' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:text-white'
                }`}
                title="Single Page Reader (Smooth & Sharp)"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden md:inline text-[11px]">Single</span>
              </button>
              {numPages > 1 && (
                <button
                  type="button"
                  onClick={() => setViewMode('continuous')}
                  className={`p-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    viewMode === 'continuous' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:text-white'
                  }`}
                  title="All Pages Continuous Scroll"
                >
                  <ScrollText className="w-3.5 h-3.5" />
                  <span className="hidden md:inline text-[11px]">All</span>
                </button>
              )}
              {blobUrl && (
                <button
                  type="button"
                  onClick={() => setViewMode('native')}
                  className={`p-1 text-xs rounded transition-colors cursor-pointer flex items-center gap-1 ${
                    viewMode === 'native' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Native Vector Browser Viewer (Full Resolution)"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span className="hidden md:inline text-[11px]">Vector</span>
                </button>
              )}
            </div>

            {/* Print Button */}
            <button 
              type="button" 
              onClick={handlePrint} 
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg hidden sm:block transition-colors cursor-pointer" 
              title="Print Document"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Direct In-App Download Button */}
            <button 
              type="button" 
              onClick={handleDownload} 
              className="px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
              title="Download PDF directly to your device"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            {/* Close Button */}
            <button 
              type="button" 
              onClick={onClose} 
              className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg ml-1 cursor-pointer transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewport Content */}
        <div 
          ref={containerRef} 
          className="w-full flex-1 bg-slate-950/95 overflow-auto p-2 sm:p-4 flex flex-col items-center justify-start select-none"
        >
          {loading && (
            <div className="flex flex-col items-center justify-center h-full my-auto text-slate-400 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
              <p className="text-sm font-medium animate-pulse text-slate-200">Loading PDF document inside app...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full my-auto max-w-md text-center p-6 bg-slate-800/80 rounded-xl border border-rose-500/30 text-slate-200 gap-3">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-full">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h5 className="font-bold text-base text-rose-400">Could not display PDF preview</h5>
              <p className="text-xs text-slate-400">{error}</p>
              <div className="flex items-center gap-2 mt-2">
                <a 
                  href={url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs font-semibold rounded-lg flex items-center gap-1.5 text-white"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open Tab
                </a>
                <button 
                  type="button" 
                  onClick={handleDownload} 
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </button>
              </div>
            </div>
          )}

          {!loading && !error && pdfDoc && (
            viewMode === 'native' ? (
              <div className="w-full h-full flex-1 rounded-xl overflow-hidden bg-white shadow-2xl">
                <iframe 
                  src={`${blobUrl}#toolbar=1&navpanes=0`} 
                  className="w-full h-full border-0 bg-white" 
                  title={title || 'PDF Preview'} 
                />
              </div>
            ) : viewMode === 'continuous' ? (
              <div className="flex flex-col items-center gap-4 w-full py-2">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                  <PdfPageItem 
                    key={pageNum}
                    pageNumber={pageNum}
                    pdfDoc={pdfDoc}
                    scale={scale}
                    rotation={rotation}
                    numPages={numPages}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center my-auto py-2">
                <PdfPageItem 
                  key={currentPage}
                  pageNumber={currentPage}
                  pdfDoc={pdfDoc}
                  scale={scale}
                  rotation={rotation}
                  numPages={numPages}
                />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
