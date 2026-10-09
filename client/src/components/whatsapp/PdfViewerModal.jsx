import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Download, ExternalLink, ChevronLeft, ChevronRight, 
  ZoomIn, ZoomOut, RotateCw, FileText, 
  Loader2, AlertCircle, Printer, Layers, ScrollText 
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function PdfViewerModal({ url, title, onClose, onDownload }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [blobUrl, setBlobUrl] = useState('');
  const [viewMode, setViewMode] = useState('continuous');

  const containerRef = useRef(null);
  const canvasRefs = useRef({});

  useEffect(() => {
    let active = true;
    if (!url) return;

    setLoading(true);
    setError(null);
    setCurrentPage(1);

    async function loadPdf() {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const blob = await response.blob();
        if (!active) return;

        const objUrl = URL.createObjectURL(blob);
        setBlobUrl(objUrl);

        const buf = await blob.arrayBuffer();
        if (!active) return;

        const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        const doc = await task.promise;
        if (!active) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (active) {
          setError(err.message || 'Failed to render PDF');
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => { active = false; };
  }, [url]);

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  const renderPage = async (pageNumber, canvas) => {
    if (!pdfDoc || !canvas) return;
    try {
      const page = await pdfDoc.getPage(pageNumber);
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * ratio, rotation });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = (viewport.width / ratio) + 'px';
      canvas.style.height = (viewport.height / ratio) + 'px';

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {}
  };

  useEffect(() => {
    if (!pdfDoc) return;
    if (viewMode === 'single') {
      const c = canvasRefs.current[currentPage];
      if (c) renderPage(currentPage, c);
    } else {
      for (let p = 1; p <= numPages; p++) {
        const c = canvasRefs.current[p];
        if (c) renderPage(p, c);
      }
    }
  }, [pdfDoc, currentPage, scale, rotation, viewMode, numPages]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      else if (e.key === 'ArrowRight') setCurrentPage(p => Math.min(p + 1, numPages));
      else if (e.key === 'ArrowLeft') setCurrentPage(p => Math.max(p - 1, 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages, onClose]);

  const handleDownload = () => {
    if (onDownload) return onDownload(url, title || 'document.pdf');
    if (blobUrl) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = title || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handlePrint = () => {
    if (!blobUrl) return;
    const w = window.open(blobUrl, '_blank');
    if (w) { w.focus(); w.print(); }
  };

  return (
    <div className='fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5' onClick={onClose}>
      <div className='relative w-full max-w-6xl h-[94vh] bg-slate-900 rounded-2xl flex flex-col overflow-hidden shadow-2xl border border-slate-700/60' onClick={e => e.stopPropagation()}>
        <div className='px-4 py-2.5 bg-slate-800/95 border-b border-slate-700/80 flex items-center justify-between text-white shrink-0 gap-3'>
          <div className='flex items-center gap-2.5 min-w-0 pr-2'>
            <div className='p-2 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0'>
              <FileText className='w-5 h-5' />
            </div>
            <div className='min-w-0'>
              <h4 className='font-bold text-sm truncate text-white max-w-[200px] sm:max-w-md' title={title}>{title || 'Document.pdf'}</h4>
              <p className='text-[11px] text-slate-400 flex items-center gap-2'>
                <span>In-App PDF Viewer</span>
                {numPages > 0 && <span className='px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono text-[10px]'>{numPages} {numPages === 1 ? 'Page' : 'Pages'}</span>}
              </p>
            </div>
          </div>
          <div className='flex items-center gap-1 sm:gap-2 shrink-0'>
            {numPages > 1 && (
              <div className='flex items-center bg-slate-700/70 rounded-lg p-0.5 mr-1'>
                <button type='button' onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage <= 1} className='p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-600 transition-colors'>
                  <ChevronLeft className='w-4 h-4' />
                </button>
                <span className='px-2 text-xs font-mono text-slate-200 select-none'>{currentPage} / {numPages}</span>
                <button type='button' onClick={() => setCurrentPage(p => Math.min(p + 1, numPages))} disabled={currentPage >= numPages} className='p-1 text-slate-300 hover:text-white disabled:opacity-30 rounded hover:bg-slate-600 transition-colors'>
                  <ChevronRight className='w-4 h-4' />
                </button>
              </div>
            )}
            <div className='hidden sm:flex items-center bg-slate-700/70 rounded-lg p-0.5'>
              <button type='button' onClick={() => setScale(s => Math.max(s - 0.2, 0.5))} className='p-1 text-slate-300 hover:text-white rounded hover:bg-slate-600' title='Zoom Out'>
                <ZoomOut className='w-4 h-4' />
              </button>
              <button type='button' onClick={() => setScale(1.0)} className='px-1.5 py-0.5 text-xs font-mono text-slate-200 rounded hover:bg-slate-600'>
                {Math.round(scale * 100)}%
              </button>
              <button type='button' onClick={() => setScale(s => Math.min(s + 0.2, 3.0))} className='p-1 text-slate-300 hover:text-white rounded hover:bg-slate-600' title='Zoom In'>
                <ZoomIn className='w-4 h-4' />
              </button>
            </div>
            <button type='button' onClick={() => setRotation(r => (r + 90) % 360)} className='p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg hidden sm:block' title='Rotate'>
              <RotateCw className='w-4 h-4' />
            </button>
            {numPages > 1 && (
              <button type='button' onClick={() => setViewMode(m => m === 'continuous' ? 'single' : 'continuous')} className='p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg hidden md:block' title='Toggle Mode'>
                {viewMode === 'continuous' ? <ScrollText className='w-4 h-4' /> : <Layers className='w-4 h-4' />}
              </button>
            )}
            <button type='button' onClick={handlePrint} className='p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg hidden sm:block' title='Print'>
              <Printer className='w-4 h-4' />
            </button>
            <a href={blobUrl || url} target='_blank' rel='noreferrer' className='p-1.5 sm:px-2.5 sm:py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5'>
              <ExternalLink className='w-4 h-4 sm:w-3.5 sm:h-3.5' />
              <span className='hidden sm:inline'>Open Tab</span>
            </a>
            <button type='button' onClick={handleDownload} className='px-2.5 sm:px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer'>
              <Download className='w-3.5 h-3.5' />
              <span className='hidden sm:inline'>Download</span>
            </button>
            <button type='button' onClick={onClose} className='p-1.5 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg ml-1 cursor-pointer'>
              <X className='w-5 h-5' />
            </button>
          </div>
        </div>
        <div ref={containerRef} className='w-full flex-1 bg-slate-950/90 overflow-auto p-4 flex flex-col items-center justify-start gap-6 select-none'>
          {loading && (
            <div className='flex flex-col items-center justify-center h-full my-auto text-slate-400 gap-3'>
              <Loader2 className='w-10 h-10 animate-spin text-emerald-500' />
              <p className='text-sm font-medium animate-pulse'>Loading PDF Document inside app...</p>
            </div>
          )}
          {error && (
            <div className='flex flex-col items-center justify-center h-full my-auto max-w-md text-center p-6 bg-slate-800/80 rounded-xl border border-rose-500/30 text-slate-200 gap-3'>
              <div className='p-3 bg-rose-500/20 text-rose-400 rounded-full'><AlertCircle className='w-8 h-8' /></div>
              <h5 className='font-bold text-base text-rose-400'>Could not display PDF preview</h5>
              <p className='text-xs text-slate-400'>{error}</p>
              <div className='flex items-center gap-2 mt-2'>
                <a href={url} target='_blank' rel='noreferrer' className='px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs font-semibold rounded-lg flex items-center gap-1.5'>
                  <ExternalLink className='w-3.5 h-3.5' /> Open Externally
                </a>
                <button type='button' onClick={handleDownload} className='px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer'>
                  <Download className='w-3.5 h-3.5' /> Download PDF
                </button>
              </div>
            </div>
          )}
          {!loading && !error && pdfDoc && (
            viewMode === 'continuous' ? (
              Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                <div key={pageNum} className='relative bg-white rounded-lg shadow-2xl overflow-hidden border border-slate-700/50 my-1 group'>
                  <canvas ref={el => { if (el) canvasRefs.current[pageNum] = el; }} className='block max-w-full' />
                  <div className='absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity'>
                    Page {pageNum} of {numPages}
                  </div>
                </div>
              ))
            ) : (
              <div className='relative bg-white rounded-lg shadow-2xl overflow-hidden border border-slate-700/50 my-auto group'>
                <canvas ref={el => { if (el) canvasRefs.current[currentPage] = el; }} className='block max-w-full' />
                <div className='absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono'>
                  Page {currentPage} of {numPages}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
